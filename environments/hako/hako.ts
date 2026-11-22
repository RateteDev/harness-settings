// ホストで常駐し、Itoguchi で呼ばれたら、そのスレッドのVM（sbx）でハーネスを非対話で1ターン動かす。
//   bun hako.ts            知らせを待ち受ける
//   bun hako.ts template   道具とハーネスを入れたテンプレートを作り直す
// VMは、最後の sbx exec が終わって30秒ほどで sbx が止め、次の sbx exec で起こす。
import { createHash, timingSafeEqual } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoDir = join(import.meta.dir, "../..");
const vmRepo = "/home/agent/.hako/repo";
const vmScript = `${vmRepo}/environments/hako/vm.sh`;
const template = "hako-base:latest";
const kits = ["docker.io/sbx/codex-mixin", "docker.io/sbx/playwright"].flatMap((kit) => ["--kit", kit]);
/** ハーネスを非対話で1ターン動かすコマンド。直近の会話があれば続ける。後ろにプロンプトを足す。 */
const harnesses: Record<string, string[]> = {
  claude: ["claude", "-p", "--continue", "--permission-mode", "bypassPermissions", "--"],
  codex: ["codex", "exec", "--skip-git-repo-check", "resume", "--last", "--"],
};

const log = (msg: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ msg, ...fields }));

async function sbx(args: string[], stdin?: ReadableStream<Uint8Array>): Promise<string> {
  // sbx には今いるディレクトリをVMへつなぐコマンドがあるため、手元のディレクトリから呼ばない。
  const proc = Bun.spawn(["sbx", ...args], { cwd: tmpdir(), stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`sbx ${args[0]} が失敗しました（${code}）: ${(err || out).trim().slice(-500)}`);
  return out;
}

async function has(kind: "vm" | "template", name: string): Promise<boolean> {
  const list = JSON.parse(await sbx(kind === "vm" ? ["ls", "--json"] : ["template", "ls", "--json"])) as Record<string, string>[] | null;
  return (list ?? []).some((e) => (kind === "vm" ? e.name === name : `${e.repository}:${e.tag}`.endsWith(`/${name}`)));
}

/** VMを作り、このクローンの global/ と environments/hako/ を写して、vm.sh の step を動かす。 */
async function create(vm: string, from: string[], step: "install" | "setup") {
  // 追加部品は認証の宣言も持つため、テンプレートから作るときにも足す。
  await sbx(["create", "--name", vm, ...from, "shell", ...kits]);
  // 全体の方針のままでは道具の導入元に届かないため、このVMだけすべて許可する。
  await sbx(["policy", "allow", "network", "--sandbox", vm, "**"]);
  try {
    const tar = Bun.spawn(["tar", "-C", repoDir, "-cf", "-", "global", "environments/hako"], { stdout: "pipe" });
    await sbx(["exec", "-i", vm, "bash", "-c", `mkdir -p ${vmRepo} && tar -C ${vmRepo} -xf -`], tar.stdout);
    await sbx(["exec", vm, vmScript, step]);
  } catch (e) {
    // 設定の途中のVMを残すと、次に呼ばれたときに設定されないまま使われる。
    await sbx(["rm", "--force", vm]).catch(() => {});
    throw e;
  }
}

async function buildTemplate() {
  const builder = "hako-template-builder";
  await sbx(["rm", "--force", builder]).catch(() => {});
  try {
    await create(builder, [], "install");
    await sbx(["exec", builder, "rm", "-rf", "/home/agent/.hako"]);
    await sbx(["stop", builder]);
    await sbx(["template", "rm", "--force", template]).catch(() => {});
    await sbx(["template", "save", builder, template]);
  } finally {
    await sbx(["rm", "--force", builder]).catch(() => {});
  }
}

type Event = { type: string; thread: { id: string; url: string }; post: { seq: number; author: { name: string }; mentions: string[] } };

function serve() {
  const env = (name: string) => {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`${name} がありません`);
    return v;
  };
  const receivePath = `/events/${env("RECEIVE_TOKEN")}`;
  const noticeUrl = env("NOTICE_URL");
  // 呼ばれる名前とハーネスの組。例: claude:claude,codex:codex
  const agents = new Map(
    env("AGENTS")
      .split(",")
      .map((pair) => pair.split(":").map((s) => s.trim()) as [string, string]),
  );
  for (const harness of agents.values()) if (!harnesses[harness]) throw new Error(`AGENTS に知らないハーネスがあります: ${harness}`);

  async function notice(thread: string, text: string) {
    // 受け取り用のURLそのものが秘密なので、失敗の理由は記録しない。
    await fetch(noticeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread, text }) }).catch(() => {});
  }

  /** スレッドごとの、まだ動かしていない呼びかけ。 */
  const waiting = new Map<string, { harness: string; prompt: string }[]>();

  /** 同じVMでは1つずつ動かし、途中に呼ばれた分はハーネスごとに1つのターンにまとめる。 */
  async function drain(thread: string) {
    const vm = `hako-${createHash("sha256").update(thread).digest("hex").slice(0, 12)}`;
    const calls = waiting.get(thread) ?? [];
    while (calls.length > 0) {
      const harness = calls[0].harness;
      const mine = calls.filter((c) => c.harness === harness);
      calls.splice(0, calls.length, ...calls.filter((c) => c.harness !== harness));
      try {
        if (!(await has("vm", vm))) {
          await notice(thread, "環境を用意しています");
          if (!(await has("template", template))) await buildTemplate();
          await create(vm, ["-t", template], "setup");
        }
        // 標準入力を閉じないと、ハーネスが追加の入力を待つ。
        const prompt = mine.map((c) => c.prompt).join("\n\n");
        await sbx(["exec", "-w", "/home/agent/workspace", vm, "bash", "-c", 'exec "$@" </dev/null', "turn", ...harnesses[harness], prompt]);
        log("ターンが終わりました", { thread, vm, harness });
      } catch (e) {
        log("ターンを動かせませんでした", { thread, vm, harness, error: String(e) });
        await notice(thread, `${harness} のターンを動かせませんでした`);
      }
    }
    waiting.delete(thread);
  }

  Bun.serve({
    hostname: "127.0.0.1",
    port: Number(env("PORT")),
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const ok = req.method === "POST" && path.length === receivePath.length && timingSafeEqual(Buffer.from(path), Buffer.from(receivePath));
      if (!ok) return new Response("not found", { status: 404 });
      const event = (await req.json().catch(() => null)) as Event | null;
      if (event?.type !== "post.created") return new Response("ok");
      const { thread, post } = event;
      const prompt = `Itoguchi のスレッド ${thread.url} （id: ${thread.id}）の seq ${post.seq} で、${post.author.name} から呼ばれました。`;
      const called = [...new Set(post.mentions.map((name) => agents.get(name)).filter((h) => h !== undefined))].map((harness) => ({ harness, prompt }));
      // Itoguchi は知らせを送り直さないため、すぐに応え、VMの操作は後で行う。
      const calls = waiting.get(thread.id);
      if (calls) calls.push(...called);
      else if (called.length > 0) {
        waiting.set(thread.id, called);
        drain(thread.id);
      }
      return new Response("ok");
    },
  });
  log("待ち受けています");
}

if (process.argv[2] === "template") await buildTemplate();
else serve();
