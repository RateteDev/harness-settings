// ホストで sbx（Docker Sandboxes）を呼び、VMを用意して、その中でハーネスの非対話の1ターンを動かす。
// VMを止めるのは sbx に任せる（最後の sbx exec が終わって30秒ほどで止まり、次の sbx exec で起きる）。
// VMの中で使うファイル（global/ と environments/hako/）は、ターンのたびにこのクローンから写す。
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hakoDir = import.meta.dir;
const repoDir = join(hakoDir, "../..");
/** VMの中の、このリポジトリの写しの置き場。リポジトリと同じ並びで global/ と environments/hako/ を置く。 */
const vmRepo = "/home/agent/.hako/repo";
const vmDir = `${vmRepo}/environments/hako/vm`;

/** vm/ の下の、run を持つディレクトリをハーネスとして扱う。 */
export function harnesses(): string[] {
  const dir = join(hakoDir, "vm");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "run")))
    .map((e) => e.name)
    .sort();
}

/** shell の土台に足す Docker 公式の追加部品。 */
const kits = [
  // Codex は、ChatGPT のサインインを sbx がホスト側で扱うため、追加部品で入れる。
  "docker.io/sbx/codex-mixin",
  // Playwright と Chromium。Node.js がなければ一緒に入る。
  "docker.io/sbx/playwright",
];
const kitArgs = kits.flatMap((kit) => ["--kit", kit]);

/** 呼ぶ側の鍵（スレッドのidなど）から、VMの名前を決める。対応を別に覚えなくて済むよう、鍵から導く。 */
export function nameFor(key: string): string {
  return `hako-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

type Result = { code: number; out: string; err: string };

async function sbx(args: string[], stdin?: ReadableStream<Uint8Array>): Promise<Result> {
  // sbx はパスを省くと今いるディレクトリを使うコマンドがあるため、手元のディレクトリから呼ばない。
  const proc = Bun.spawn(["sbx", ...args], { cwd: tmpdir(), stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out, err };
}

async function must(what: string, args: string[], stdin?: ReadableStream<Uint8Array>): Promise<string> {
  const r = await sbx(args, stdin);
  if (r.code !== 0) throw new Error(`${what}に失敗しました（${r.code}）: ${(r.err || r.out).trim().slice(-500)}`);
  return r.out;
}

export async function exists(name: string): Promise<boolean> {
  const list = JSON.parse(await must("環境の一覧", ["ls", "--json"])) as { name: string }[] | null;
  return (list ?? []).some((s) => s.name === name);
}

/** このクローンの global/ と environments/hako/ を、VMへ写す。消したファイルが残らないよう、置き場ごと入れ替える。 */
async function sync(name: string) {
  const tar = Bun.spawn(["tar", "-C", repoDir, "-cf", "-", "global", "environments/hako"], { stdout: "pipe", stderr: "inherit" });
  const script = `set -e; d=${vmRepo}; rm -rf "$d.new"; mkdir -p "$d.new"; tar -C "$d.new" -xf -; rm -rf "$d"; mv "$d.new" "$d"`;
  await must("ファイルの写し", ["exec", "-i", name, "bash", "-c", script], tar.stdout);
  if ((await tar.exited) !== 0) throw new Error("tar に失敗しました");
}

/** 道具とハーネスを入れ終えたVMを写したテンプレート。作るたびに入れると数分かかるため、1回入れたものを使い回す。 */
const template = "hako-base:latest";

async function hasTemplate(): Promise<boolean> {
  const [repository, tag] = template.split(":");
  const list = JSON.parse(await must("テンプレートの一覧", ["template", "ls", "--json"])) as { repository: string; tag: string }[] | null;
  return (list ?? []).some((t) => t.repository.endsWith(`/${repository}`) && t.tag === tag);
}

/** 全体の方針（balanced）のままでは道具の導入元に届かないため、このVMだけすべて許可する。環境ごとの規則は sbx rm で一緒に消える。 */
async function allowNetwork(name: string) {
  await must("通信の許可", ["policy", "allow", "network", "--sandbox", name, "**"]);
}

/** テンプレートを作り直す。道具とハーネスの版を上げるときにも呼ぶ。数分かかる。 */
export async function buildTemplate() {
  const builder = "hako-template-builder";
  await sbx(["rm", "--force", builder]);
  // パスを渡さずに作ると、手元のディレクトリとつながないVMになる。
  await must("環境の作成", ["create", "--name", builder, "shell", ...kitArgs]);
  try {
    await allowNetwork(builder);
    await sync(builder);
    await must("道具の導入", ["exec", builder, "bash", `${vmDir}/install.sh`]);
    // 写しはターンのたびに入れ替えるため、テンプレートには残さない。
    await must("後片付け", ["exec", builder, "rm", "-rf", "/home/agent/.hako"]);
    await must("環境の停止", ["stop", builder]);
    await sbx(["template", "rm", "--force", template]);
    await must("テンプレートの保存", ["template", "save", builder, template]);
  } finally {
    await sbx(["rm", "--force", builder]);
  }
}

/** テンプレートからVMを作る。テンプレートがなければ先に作る。 */
export async function create(name: string) {
  if (!(await hasTemplate())) await buildTemplate();
  // 追加部品は、認証を sbx の中継に任せる宣言も持つため、テンプレートから作るときにも足す。
  await must("環境の作成", ["create", "--name", name, "-t", template, "shell", ...kitArgs]);
  await allowNetwork(name);
}

/** ハーネスの非対話の1ターンを動かし、終わるまで待つ。VMが止まっていれば sbx が起こす。 */
export async function turn(name: string, harness: string, prompt: string) {
  if (!harnesses().includes(harness)) throw new Error(`知らないハーネスです: ${harness}（${harnesses().join("|")}）`);
  await sync(name);
  await must(`${harness} のターン`, ["exec", name, `${vmDir}/turn`, harness, prompt]);
}

// 所有者がテンプレートを作り直すときの入口: bun environments/hako/hako.ts template
if (import.meta.main) {
  if (process.argv[2] !== "template") {
    console.error("使い方: bun hako.ts template");
    process.exit(2);
  }
  await buildTemplate();
  console.log(`テンプレート ${template} を作りました`);
}
