// ホストで常駐し、Itoguchi で呼ばれたら、そのスレッドのVM（sbx）でハーネスを非対話で1ターン動かす。
//   bun hako.ts            呼びかけを待ち受ける。ITOGUCHI_API_KEY に、呼ばれるエージェントのAPIキーを渡す
//   bun hako.ts template   リモートの install.sh で、VMの元になるテンプレートを作り直す
// VMは起こしたままにする。
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const remote = "https://github.com/RateteDev/harness-settings";
const template = "hako-base:latest";
const itoguchi = "https://itoguchi.ratete.dev";
/** APIキーの名前で呼ばれたときに、VMで動かすハーネス。 */
const harness = "claude";

const log = (msg: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ msg, ...fields }));

async function sbx(...args: string[]): Promise<string> {
  // sbx には今いるディレクトリをVMへつなぐコマンドがあるため、手元のディレクトリから呼ばない。
  const proc = Bun.spawn(["sbx", ...args], { cwd: tmpdir(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`sbx ${args[0]} が失敗しました（${code}）: ${(err || out).trim().slice(-500)}`);
  return out;
}

async function list(kind: "vm" | "template"): Promise<string[]> {
  const entries = JSON.parse(await sbx(...(kind === "vm" ? ["ls"] : ["template", "ls"]), "--json")) as Record<string, string>[] | null;
  return (entries ?? []).map((e) => (kind === "vm" ? e.name : `${e.repository}:${e.tag}`));
}

const hasVm = async (vm: string) => (await list("vm")).includes(vm);

async function create(vm: string, ...from: string[]) {
  await sbx("create", "--name", vm, ...from, "shell");
  // 全体の方針のままでは道具の導入元に届かないため、このVMだけすべて許可する。
  await sbx("policy", "allow", "network", "--sandbox", vm, "**");
  // sbx が作るたびに置く指示書。自分のシステムプロンプトだけを聞かせるために消す。
  await sbx("exec", vm, "rm", "/home/agent/AGENTS.md");
}

async function buildTemplate() {
  const builder = "hako-template-builder";
  await sbx("rm", "--force", builder).catch(() => {});
  try {
    await create(builder);
    await sbx("exec", builder, "bash", "-c", `git clone --depth 1 ${remote} /tmp/repo && /tmp/repo/environments/hako/install.sh && rm -rf /tmp/repo`);
    await sbx("stop", builder);
    await sbx("template", "rm", "--force", template).catch(() => {});
    await sbx("template", "save", builder, template);
  } finally {
    await sbx("rm", "--force", builder).catch(() => {});
  }
}

/** 呼ばれた場所。本文は載っておらず、ハーネスがスレッドを読みに行く。 */
type Events = { cursor: number; mentions: { thread: string; seq: number }[] };

async function serve() {
  const key = process.env.ITOGUCHI_API_KEY?.trim();
  if (!key) throw new Error("ITOGUCHI_API_KEY がありません");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  // どこまで受け取ったか。止まっていた間の呼びかけを、次に動いたときに続きから受け取る。
  const cursorFile = join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "hako", "cursor");

  async function notice(thread: string, text: string) {
    await fetch(`${itoguchi}/api/threads/${thread}/notices`, { method: "POST", headers, body: JSON.stringify({ text }) }).catch(() => {});
  }

  const vmName = /^hako-[0-9a-f]{12}$/;
  const held = new Set<string>();
  /** sbx は最後の sbx exec が終わるとVMを止めるため、終わらないコマンドを動かしておく。 */
  async function hold(vm: string) {
    if (held.has(vm)) return;
    held.add(vm);
    while (await hasVm(vm).catch(() => true)) {
      await sbx("exec", vm, "sleep", "infinity").catch(() => {});
      await Bun.sleep(5000);
    }
    held.delete(vm);
  }

  /** スレッドごとの、まだ動かしていない呼びかけ。 */
  const waiting = new Map<string, string[]>();

  /** 同じVMでは1つずつ動かし、途中に呼ばれた分は次の1つのターンにまとめる。 */
  async function drain(thread: string) {
    const vm = `hako-${createHash("sha256").update(thread).digest("hex").slice(0, 12)}`;
    const prompts = waiting.get(thread) ?? [];
    while (prompts.length > 0) {
      const prompt = prompts.splice(0).join("\n\n");
      try {
        if (!(await hasVm(vm))) {
          if (!(await list("template")).some((t) => t.endsWith(`/${template}`))) await buildTemplate();
          await create(vm, "-t", template);
        }
        hold(vm);
        await sbx("exec", vm, "hako", "turn", harness, prompt);
        log("ターンが終わりました", { thread, vm });
      } catch (e) {
        log("ターンを動かせませんでした", { thread, vm, error: String(e) });
        await notice(thread, "ターンを動かせませんでした");
      }
    }
    waiting.delete(thread);
  }

  function call(thread: string, seq: number) {
    const prompt = `Itoguchi のスレッド ${itoguchi}/#/t/${thread} （id: ${thread}）の seq ${seq} で呼ばれました。`;
    const prompts = waiting.get(thread);
    if (prompts) prompts.push(prompt);
    else {
      waiting.set(thread, [prompt]);
      drain(thread);
    }
  }

  list("vm").then((vms) => vms.filter((vm) => vmName.test(vm)).forEach(hold));
  const saved = await Bun.file(cursorFile).text().catch(() => "");
  let cursor = saved ? Number(saved) : undefined;
  log("待ち受けています", { cursor });
  // 呼ばれるまで応えが返らないロングポーリング。こちらから繋ぐだけなので、外から届くURLは要らない。
  for (;;) {
    try {
      const res = await fetch(`${itoguchi}/api/events${cursor === undefined ? "" : `?after=${cursor}`}`, { headers });
      // キーが取り消されたら、繰り返しても直らないので止まる。
      if (res.status === 401) throw new Error("ITOGUCHI_API_KEY が受け付けられませんでした");
      if (!res.ok) {
        log("呼びかけを確かめられませんでした", { status: res.status });
        await Bun.sleep(5000);
        continue;
      }
      const events = (await res.json()) as Events;
      for (const m of events.mentions) call(m.thread, m.seq);
      if (events.cursor !== cursor) {
        cursor = events.cursor;
        await Bun.write(cursorFile, String(cursor));
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("ITOGUCHI_API_KEY")) throw e;
      log("Itoguchi に繋げませんでした", { error: String(e) });
      await Bun.sleep(5000);
    }
  }
}

if (process.argv[2] === "template") await buildTemplate();
else await serve();
