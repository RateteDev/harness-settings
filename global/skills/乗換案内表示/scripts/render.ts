#!/usr/bin/env bun

// 乗換案内のJSONを、外部に依存しない1枚のHTMLにする。
// 入力の形は SKILL.md と templates/例.json に示す。

import { readFileSync, writeFileSync } from "node:fs"
import { renderPage } from "./page.ts"
import { InputError, parseRoute } from "./route.ts"

const USAGE = `使い方: render.ts <入力.json> [-o <出力.html>]
  入力.json  乗換案内のデータ（形は SKILL.md を参照）
  -o         出力先。省略すると標準出力へ書く
  -h         この説明を表示する`

function parseArgs(argv: string[]): { input: string; output?: string } {
  const inputs: string[] = []
  let output: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "-o") {
      inputs.push(argv[i])
      continue
    }
    output = argv[++i]
    if (output === undefined || output.startsWith("-")) throw new InputError("-o には出力先のパスを指定する")
  }
  if (inputs.length !== 1) throw new InputError(`入力ファイルを1つ指定する\n${USAGE}`)
  return { input: inputs[0], output }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    throw new InputError(`入力を読めない: ${(e as Error).message}`)
  }
}

function main(argv: string[]) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE)
    return
  }
  const { input, output } = parseArgs(argv)
  const html = renderPage(parseRoute(readJson(input)))
  if (output === undefined) process.stdout.write(html)
  else writeFileSync(output, html)
}

try {
  main(process.argv.slice(2))
} catch (e) {
  // 入力の誤り以外は実装か環境の不具合なので、原因を追えるようそのまま落とす。
  if (!(e instanceof InputError)) throw e
  console.error(`エラー: ${e.message}`)
  process.exit(1)
}
