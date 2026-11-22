// ホストの連携サーバー。Itoguchi の連携の知らせを受け、呼ばれたスレッドのVMでハーネスのターンを動かす。
// スレッドごとにVMを1つ持ち、呼ばれたハーネスはどれも同じVMで動く。VMを止めるのは sbx に任せ、消すのは所有者が行う。
// Itoguchi は知らせを1回だけ送り、送り直さない。すぐに応え、VMの操作は後で行う。
import { timingSafeEqual } from "node:crypto";
import { create, exists, nameFor, turn } from "../hako.ts";

type Event =
  | { type: "post.created"; thread: { id: string; url: string }; post: { seq: number; author: { name: string }; mentions: string[] } }
  | { type: "thread.closed" | "thread.created" | "test" };

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

const log = (msg: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ msg, ...fields }));

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
  const vm = nameFor(thread);
  const calls = waiting.get(thread) ?? [];
  while (calls.length > 0) {
    // ターンの途中に同じハーネスが何度も呼ばれた分は、1つのターンにまとめて渡す。
    const harness = calls[0].harness;
    const prompt = calls.filter((c) => c.harness === harness).map((c) => c.prompt).join("\n\n");
    calls.splice(0, calls.length, ...calls.filter((c) => c.harness !== harness));
    try {
      if (!(await exists(vm))) {
        await notice(thread, "環境を用意しています");
        await create(vm);
        log("環境を用意しました", { thread, vm });
      }
      await turn(vm, harness, prompt);
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
  const calls = waiting.get(thread.id);
  const added = [...harnesses].map((harness) => ({ harness, prompt }));
  if (calls) {
    calls.push(...added);
    return;
  }
  waiting.set(thread.id, added);
  drain(thread.id).catch((e) => log("処理できませんでした", { thread: thread.id, error: String(e) }));
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

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
