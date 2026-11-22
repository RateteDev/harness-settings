#!/usr/bin/env bun

// モデルは版を固定する。別名は新しい版が出ると黙って切り替わり、直した結果を後から再現できなくなるため。
const MODEL = "gemini-3.8-flash"
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const TIMEOUT_MS = 600_000
const MAX_ATTEMPTS = 4
const BACKOFF_BASE_MS = 3_000
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

// ユーザーが調整した指示文。温度・推論・出力上限を既定値のまま送る前提で調整したため、パラメータは足さない。
// 変えるときは、同じファイルで旧設定の出力と比べてから変える。
const SYSTEM_PROMPT = `与えられたエージェント向けのスキル定義ファイルを日本語話者とそのエージェント向けに読みやすく直してください。
原文の意図は尊重しますが一般的に馴染みのない用語、二重否定、冗長な表現、過剰な例などここに挙げた例以外でも読みづらいと感じたものがあれば、容赦なく置き換えや削除、または追加を行ってください。

※ 読みやすい文章…人間が読む際に認知負荷が少なく読め、エージェントが迷いなく動ける表現でかつトークンも必要以上に消費しない文章を指す。`

const USAGE = `gemini-rewrite - Rewrite the wording of skill documents with Gemini, in place.

Usage:
  gemini-rewrite <file>...

Environment:
  GEMINI_API_KEY  API key for the Gemini API (required).

The whole file is sent and overwritten with the result; review it with git diff.
The frontmatter in the result is replaced with the original one.
A file whose rewrite fails is left untouched.
Exit status is 0 only when every file was rewritten.`

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/

class RewriteError extends Error {}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE)
    return args.length === 0 ? 2 : 0
  }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error("gemini-rewrite: GEMINI_API_KEY is not set.")
    return 2
  }

  let failed = 0
  for (const file of args) {
    try {
      const result = await rewrite(file, apiKey)
      console.error(`${file}: rewritten (${result})`)
    } catch (error) {
      failed++
      const reason = error instanceof RewriteError ? error.message : `unexpected error: ${String(error)}`
      console.error(`${file}: not rewritten: ${reason}`)
    }
  }
  return failed === 0 ? 0 : 1
}

async function rewrite(file: string, apiKey: string): Promise<string> {
  const original = await Bun.file(file).text()
  const response = await generate(original, apiKey)

  const candidate = response.candidates?.[0]
  // 出力上限や安全性で打ち切られた本文を書き込むと、文書の後半が黙って消えるため止める。
  if (candidate?.finishReason !== "STOP") {
    throw new RewriteError(`generation did not finish normally (finishReason: ${candidate?.finishReason ?? "none"})`)
  }
  const text = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")

  const body = stripFrontmatter(unwrap(text)).replace(/^\n+/, "")
  if (!body.startsWith("#")) {
    throw new RewriteError("output does not start with a heading after removing wrappers")
  }
  const frontmatter = original.match(FRONTMATTER)?.[0]
  const rewritten = (frontmatter ? `${frontmatter}\n` : "") + body.replace(/\n*$/, "\n")
  await Bun.write(file, rewritten)

  const usage = response.usageMetadata ?? {}
  return `model ${response.modelVersion ?? "unknown"}, tokens in ${usage.promptTokenCount ?? "?"} / out ${usage.candidatesTokenCount ?? "?"} / thinking ${usage.thoughtsTokenCount ?? 0}`
}

type GenerateResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  modelVersion?: string
}

async function generate(document: string, apiKey: string): Promise<GenerateResponse> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: document }] }],
  })
  let lastReason = ""
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await Bun.sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1))
    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      lastReason = `request failed (${error instanceof Error ? error.name : "error"})`
      continue
    }
    if (response.ok) return (await response.json()) as GenerateResponse
    // 応答本文には入力の一部が含まれうるため、状態の名前だけを伝える。
    const status = await response.json().then((d) => d?.error?.status, () => undefined)
    lastReason = `HTTP ${response.status}${status ? ` ${status}` : ""}`
    if (!RETRY_STATUSES.has(response.status)) break
  }
  throw new RewriteError(lastReason)
}

// 本文全体をコードフェンスで囲む出力と、前置きの後に区切り線を置いて本文を始める出力を、本文だけにする。
function unwrap(text: string): string {
  let lines = text.replace(/\r\n/g, "\n").split("\n")
  if (lines.length > 0 && !/^(#|---|```)/.test(lines[0])) {
    const rule = lines.findIndex((line) => line.trim() === "---")
    if (rule !== -1) {
      let next = rule + 1
      while (next < lines.length && lines[next].trim() === "") next++
      if (lines[next]?.startsWith("#")) lines = lines.slice(next)
    }
  }
  // 囲みとみなすのは、出力の先頭のフェンスだけにする。本文中のコード例を囲みと取り違えないため。
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first !== -1 && /^```(yaml|markdown|md)?\s*$/.test(lines[first]) && /^(---|#)/.test(lines[first + 1] ?? "")) {
    // frontmatterの閉じの直後がフェンスなら、frontmatterだけの囲みとして開きと閉じの2行を外す。
    if (lines[first + 1] === "---") {
      const fmEnd = lines.findIndex((line, j) => j > first + 1 && line === "---")
      let next = fmEnd + 1
      while (fmEnd !== -1 && next < lines.length && lines[next].trim() === "") next++
      if (fmEnd !== -1 && lines[next]?.trim() === "```") {
        return [...lines.slice(first + 1, fmEnd + 1), ...lines.slice(next + 1)].join("\n")
      }
    }
    const last = lines.findLastIndex((line) => line.trim() !== "")
    if (last > first && lines[last].trim() === "```") return lines.slice(first + 1, last).join("\n")
  }
  return lines.join("\n")
}

function stripFrontmatter(text: string): string {
  const match = text.match(FRONTMATTER)
  return match ? text.slice(match[0].length) : text
}

process.exit(await main())
