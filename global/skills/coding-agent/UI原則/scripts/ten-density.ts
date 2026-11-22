#!/usr/bin/env bun

// 読点の多さを、読点の数を本文の文字数で割った値だけで判定する。
// 並列や長い主語の後の読点を例外にするには構文解析が要り、依存と処理が重くなるため、例外は設けず全ての読点を数える。
const MAX_PER_100_CHARS = 1

const USAGE = `ten-density - Check that a text has at most ${MAX_PER_100_CHARS} touten (、) per 100 characters.

Usage:
  ten-density <file>...

The frontmatter, fenced code, inline code, image links and URLs are excluded,
and whitespace is not counted as a character.
Exit status is 0 only when every file is within the limit (2 on invalid input).`

function bodyOf(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s/g, "")
}

async function main(): Promise<number> {
  const files = process.argv.slice(2)
  if (files.length === 0 || files.includes("--help") || files.includes("-h")) {
    console.log(USAGE)
    return files.length === 0 ? 2 : 0
  }

  let exceeded = 0
  let invalid = 0
  for (const file of files) {
    const source = Bun.file(file)
    if (!(await source.exists())) {
      console.error(`${file}: not found`)
      invalid++
      continue
    }
    const body = bodyOf(await source.text())
    if (body.length === 0) {
      console.error(`${file}: no text to measure`)
      invalid++
      continue
    }
    const touten = body.split("、").length - 1
    const density = (touten / body.length) * 100
    const over = density > MAX_PER_100_CHARS
    if (over) exceeded++
    console.log(`${over ? "NG" : "OK"} ${density.toFixed(2)} per 100 chars (${touten} / ${body.length})  ${file}`)
  }
  return invalid > 0 ? 2 : exceeded > 0 ? 1 : 0
}

process.exit(await main())
