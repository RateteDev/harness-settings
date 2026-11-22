// ホストで常駐する。Itoguchi で呼ばれたら、そのスレッドのVM（Docker Sandboxes、sbx）でハーネスの非対話の1ターンを動かす。
//   bun hako.ts            知らせを待ち受ける（環境変数は README を参照）
//   bun hako.ts template   道具とハーネスを入れたテンプレートを作り直す
// スレッドごとにVMを1つ持ち、呼ばれたハーネスはどれも同じVMで動く。
// VMを止めるのは sbx に任せ（最後の sbx exec が終わって30秒ほどで止まり、次の sbx exec で起きる）、消すのは所有者が行う。
// VMの中で使うファイル（global/ と environments/hako/）は、ターンのたびにこのクローンから写す。
import { createHash, timingSafeEqual } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoDir = join(import.meta.dir, "../..");
/** VMの中の、このリポジトリの写しの置き場。リポジトリと同じ並びで global/ と environments/hako/ を置く。 */
const vmRepo = "/home/agent/.hako/repo";
const vmScript = `${vmRepo}/environments/hako/vm.sh`;
/** 道具とハーネスを入れ終えたVMを写したテンプレート。作るたびに入れると数分かかるため、1回入れたものを使い回す。 */
const template = "hako-base:latest";
/** shell の土台に足す Docker 公式の追加部品。 */
const kits = [
  // Codex は、ChatGPT のサインインを sbx がホスト側で扱うため、追加部品で入れる。
  "docker.io/sbx/codex-mixin",
  // Playwright と Chromium。Node.js がなければ一緒に入る。
  "docker.io/sbx/playwright",
];
const kitArgs = kits.flatMap((kit) => ["--kit", kit]);

const log = (msg: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ msg, ...fields }));

async function sbx(what: string, args: string[], stdin?: ReadableStream<Uint8Array>): Promise<string> {
  // sbx はパスを省くと今いるディレクトリを使うコマンドがあるため、手元のディレクトリから呼ばない。
  const proc = Bun.spawn(["sbx", ...args], { cwd: tmpdir(), stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${what}に失敗しました（${code}）: ${(err || out).trim().slice(-500)}`);
  return out;
}

/** このクローンの global/ と environments/hako/ を、VMへ写す。消したファイルが残らないよう、置き場ごと入れ替える。 */
async function sync(vm: string) {
  const tar = Bun.spawn(["tar", "-C", repoDir, "-cf", "-", "global", "environments/hako"], { stdout: "pipe", stderr: "inherit" });
  const script = `set -e; d=${vmRepo}; rm -rf "$d.new"; mkdir -p "$d.new"; tar -C "$d.new" -xf -; rm -rf "$d"; mv "$d.new" "$d"`;
  await sbx("ファイルの写し", ["exec", "-i", vm, "bash", "-c", script], tar.stdout);
  if ((await tar.exited) !== 0) throw new Error("tar に失敗しました");
}

/** パスを渡さずに作り、手元のディレクトリとつながないVMにする。 */
async function createVM(vm: string, from: string[]) {
  await sbx("環境の作成", ["create", "--name", vm, ...from, "shell", ...kitArgs]);
  // 全体の方針（balanced）のままでは道具の導入元に届かないため、このVMだけすべて許可する。環境ごとの規則は sbx rm で一緒に消える。
  await sbx("通信の許可", ["policy", "allow", "network", "--sandbox", vm, "**"]);
}

/** テンプレートを作り直す。道具とハーネスの版を上げるときにも呼ぶ。数分かかる。 */
async function buildTemplate() {
  const builder = "hako-template-builder";
  await sbx("前の作りかけの削除", ["rm", "--force", builder]).catch(() => {});
  await createVM(builder, []);
  try {
    await sync(builder);
    await sbx("道具の導入", ["exec", builder, vmScript, "install"]);
    // 写しはターンのたびに入れ替えるため、テンプレートには残さない。
    await sbx("後片付け", ["exec", builder, "rm", "-rf", "/home/agent/.hako"]);
    await sbx("環境の停止", ["stop", builder]);
    await sbx("前のテンプレートの削除", ["template", "rm", "--force", template]).catch(() => {});
    await sbx("テンプレートの保存", ["template", "save", builder, template]);
  } finally {
    await sbx("作りかけの削除", ["rm", "--force", builder]).catch(() => {});
  }
}

/** スレッドのVMがなければ作る。テンプレートもなければ先に作る。作り始める前に onCreate を呼ぶ。 */
async function ensureVM(vm: string, onCreate: () => Promise<void>) {
  const vms = JSON.parse(await sbx("環境の一覧", ["ls", "--json"])) as { name: string }[] | null;
  if ((vms ?? []).some((s) => s.name === vm)) return;
  await onCreate();
  const [repository, tag] = template.split(":");
  const templates = JSON.parse(await sbx("テンプレートの一覧", ["template", "ls", "--json"])) as { repository: string; tag: string }[] | null;
  if (!(templates ?? []).some((t) => t.repository.endsWith(`/${repository}`) && t.tag === tag)) await buildTemplate();
  // 追加部品は、認証を sbx の中継に任せる宣言も持つため、テンプレートから作るときにも足す。
  await createVM(vm, ["-t", template]);
}

type Event =
  | { type: "post.created"; thread: { id: string; url: string }; post: { seq: number; author: { name: string }; mentions: string[] } }
  | { type: "thread.closed" | "thread.created" | "test" };

function serve() {
  const required = (name: string) => {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`${name} がありません。README の設定を見てください`);
    return v;
  };
  const port = Number(required("PORT"));
  const receivePath = `/events/${required("RECEIVE_TOKEN")}`;
  const noticeUrl = required("NOTICE_URL");
  // 呼ばれる名前（Itoguchi の参加者の名前）と、その名前で動かすハーネス。例: claude:claude,てすと:claude
  const agents = new Map(
    required("AGENTS")
      .split(",")
      .map((pair) => pair.split(":").map((s) => s.trim()) as [string, string]),
  );

  /** スレッドへ1行の知らせを出す。届かなくても、ターンの方は止めない。 */
  async function notice(thread: string, text: string) {
    try {
      const res = await fetch(noticeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread, text }) });
      if (!res.ok) log("知らせを出せませんでした", { thread, status: res.status });
    } catch {
      // 受け取り用のURLそのものが秘密なので、理由にURLを含めない。
      log("知らせを出せませんでした", { thread });
    }
  }

  type Call = { harness: string; prompt: string };
  /** スレッドごとの、まだ動かしていない呼びかけ。項目があるスレッドは、drain が動いている。 */
  const waiting = new Map<string, Call[]>();

  /** スレッドのVMで、待っている呼びかけを順に動かす。同じVMでは1つずつ動かし、VMの中のファイルの入れ替えとぶつからないようにする。 */
  async function drain(thread: string) {
    // 対応を別に覚えなくて済むよう、VMの名前はスレッドのidから導く。
    const vm = `hako-${createHash("sha256").update(thread).digest("hex").slice(0, 12)}`;
    const calls = waiting.get(thread) ?? [];
    while (calls.length > 0) {
      // ターンの途中に同じハーネスが何度も呼ばれた分は、1つのターンにまとめて渡す。
      const harness = calls[0].harness;
      const prompt = calls
        .filter((c) => c.harness === harness)
        .map((c) => c.prompt)
        .join("\n\n");
      calls.splice(0, calls.length, ...calls.filter((c) => c.harness !== harness));
      try {
        await ensureVM(vm, () => notice(thread, "環境を用意しています"));
        await sync(vm);
        await sbx(`${harness} のターン`, ["exec", vm, vmScript, "turn", harness, prompt]);
        log("ターンが終わりました", { thread, vm, harness });
      } catch (e) {
        log("ターンを動かせませんでした", { thread, vm, harness, error: String(e) });
        await notice(thread, `${harness} のターンを動かせませんでした`);
      }
    }
    waiting.delete(thread);
  }

  function called(event: Extract<Event, { type: "post.created" }>) {
    const { thread, post } = event;
    const prompt = `Itoguchi のスレッド ${thread.url} （id: ${thread.id}）の seq ${post.seq} で、${post.author.name} から呼ばれました。`;
    const harnesses = new Set(post.mentions.map((name) => agents.get(name)).filter((h): h is string => h !== undefined));
    if (harnesses.size === 0) return;
    const added = [...harnesses].map((harness) => ({ harness, prompt }));
    const calls = waiting.get(thread.id);
    if (calls) {
      calls.push(...added);
      return;
    }
    waiting.set(thread.id, added);
    drain(thread.id).catch((e) => log("処理できませんでした", { thread: thread.id, error: String(e) }));
  }

  const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  // Itoguchi は知らせを1回だけ送り、送り直さない。すぐに応え、VMの操作は後で行う。
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method !== "POST" || !sameText(url.pathname, receivePath)) return new Response("not found", { status: 404 });
      const event = (await req.json().catch(() => null)) as Event | null;
      if (!event?.type) return new Response("bad request", { status: 400 });
      if (event.type === "post.created") called(event);
      return new Response("ok");
    },
  });
  log("待ち受けています", { port });
}

if (process.argv[2] === "template") {
  await buildTemplate();
  log("テンプレートを作りました", { template });
} else if (process.argv[2] === undefined) {
  serve();
} else {
  console.error("使い方: bun hako.ts [template]");
  process.exit(2);
}
