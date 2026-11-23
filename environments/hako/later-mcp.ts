// VMの中でハーネスが起動するMCPサーバー。予約のツールを1つ出す。
// 依存を増やさないよう、MCPのやり取りのうち要るものだけを自分で話す。
const tool = {
  name: "later",
  description: [
    "コマンドが終わったら、この会話の次のターンを始める。",
    "ターンの中でバックグラウンドの処理を待つと、その間はターンが終わらず、新しい呼びかけに応えられない。数分を超えて待つときは、これで予約してターンを終える。",
    "次のターンには、コマンドの終了コードと prompt が届く。",
    "PIDを返す。kill <PID> で取り消せる。VMが止まると予約は消える。",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "bash で動かす、終わるのを待つコマンド" },
      prompt: { type: "string", description: "次のターンのプロンプト" },
    },
    required: ["command", "prompt"],
  },
};

async function later(args: Record<string, unknown>) {
  if (typeof args.command !== "string" || typeof args.prompt !== "string") return { content: [{ type: "text", text: "command と prompt が要ります" }], isError: true };
  const proc = Bun.spawn([`${process.env.HOME}/.local/bin/hako`, "later", args.command, args.prompt], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { content: [{ type: "text", text: (code === 0 ? out : err).trim() }], isError: code !== 0 };
}

for await (const line of console) {
  if (!line.trim()) continue;
  const { id, method, params } = JSON.parse(line);
  // id のないものは通知で、返事を求められていない。
  if (id === undefined) continue;
  const reply = (body: object) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...body })}\n`);
  if (method === "initialize") reply({ result: { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "hako", version: "1" } } });
  else if (method === "ping") reply({ result: {} });
  else if (method === "tools/list") reply({ result: { tools: [tool] } });
  else if (method === "tools/call" && params.name === tool.name) reply({ result: await later(params.arguments ?? {}) });
  else reply({ error: { code: -32601, message: `知らない要求です: ${method}` } });
}
