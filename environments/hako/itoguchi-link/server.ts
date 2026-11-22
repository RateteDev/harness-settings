// ホストの連携サーバー。Itoguchi の連携の知らせを受け、呼ばれたスレッドに hako の環境を用意してターンを頼む。
// スレッドとハーネスの組ごとに環境を1つ持ち、スレッドが閉じたら消す。止める・起こすは hako が行う。
// Itoguchi は知らせを1回だけ送り、送り直さない。すぐに応え、hako の操作は後で1つずつ行う。
import { timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Event =
  | { type: "post.created"; thread: { id: string; url: string }; post: { seq: number; author: { name: string }; mentions: string[] } }
  | { type: "thread.closed"; thread: { id: string } }
  | { type: "thread.created" | "test" };

const required = (name: string) => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} がありません。README の設定を見てください`);
  return v;
};

const port = Number(required("PORT"));
const receivePath = `/events/${required("RECEIVE_TOKEN")}`;
const noticeUrl = required("NOTICE_URL");
// 呼ばれる名前（Itoguchi の参加者の名前）と、その名前で動かす hako のハーネス。例: claude:claude,てすと:claude
const agents = new Map(
  required("AGENTS")
    .split(",")
    .map((pair) => pair.split(":").map((s) => s.trim()) as [string, string]),
);
const statePath = join(process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "", ".local/state"), "hako/itoguchi-link.json");

/** スレッドとハーネスの組 → hako の環境の名前。 */
type State = Record<string, string>;
const keyOf = (thread: string, harness: string) => `${thread} ${harness}`;

function loadState(): State {
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as State;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

function saveState(state: State) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

const log = (msg: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ msg, ...fields }));

async function hako(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["hako", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`hako ${args[0]} が失敗しました（${code}）: ${err.trim().slice(-500)}`);
  return out.trim();
}

async function existing(): Promise<Set<string>> {
  return new Set((await hako("ls")).split("\n").filter(Boolean).map((line) => line.split("\t")[0]));
}

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

async function called(event: Extract<Event, { type: "post.created" }>) {
  const { thread, post } = event;
  const prompt = `Itoguchi のスレッド ${thread.url} （id: ${thread.id}）の seq ${post.seq} で、${post.author.name} から呼ばれました。`;
  for (const name of post.mentions) {
    const harness = agents.get(name);
    if (!harness) continue;
    const state = loadState();
    const key = keyOf(thread.id, harness);
    try {
      const vm = state[key];
      if (vm && (await existing()).has(vm)) {
        const result = await hako("turn", vm, harness, prompt);
        log("ターンを頼みました", { thread: thread.id, vm, result });
      } else {
        const created = await hako("up");
        state[key] = created;
        saveState(state);
        await hako("turn", created, harness, prompt);
        log("環境を用意しました", { thread: thread.id, vm: created });
        await notice(thread.id, "環境を用意しました");
      }
    } catch (e) {
      log("ターンを頼めませんでした", { thread: thread.id, harness, error: String(e) });
      await notice(thread.id, "ターンを始められませんでした");
    }
  }
}

async function closed(thread: string) {
  const state = loadState();
  const keys = Object.keys(state).filter((k) => k.startsWith(`${thread} `));
  if (keys.length === 0) return;
  const alive = await existing();
  for (const key of keys) {
    try {
      if (alive.has(state[key])) await hako("rm", state[key]);
      log("環境を片付けました", { thread, vm: state[key] });
      delete state[key];
    } catch (e) {
      log("環境を片付けられませんでした", { thread, vm: state[key], error: String(e) });
    }
  }
  saveState(state);
  await notice(thread, "環境を片付けました");
}

// 知らせは届いた順に1つずつ処理し、同じスレッドに環境を2つ作らないようにする。
let chain = Promise.resolve();
const enqueue = (work: () => Promise<void>) => {
  chain = chain.then(work).catch((e) => log("処理できませんでした", { error: String(e) }));
};

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "POST" || !sameText(url.pathname, receivePath)) return new Response("not found", { status: 404 });
    const event = (await req.json().catch(() => null)) as Event | null;
    if (!event?.type) return new Response("bad request", { status: 400 });
    if (event.type === "post.created") enqueue(() => called(event));
    if (event.type === "thread.closed") enqueue(() => closed(event.thread.id));
    return new Response("ok");
  },
});
log("待ち受けています", { port });
