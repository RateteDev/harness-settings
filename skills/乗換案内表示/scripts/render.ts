#!/usr/bin/env bun

// 乗換案内のJSONを、外部に依存しない1枚のHTMLにする。
// 入力の形は SKILL.md と templates/例.json に示す。

import { readFileSync, writeFileSync } from "node:fs"

const TEMPLATE_FILES = ["../templates/トークン.css", "../templates/乗換案内.css"] as const

const USAGE = `使い方: render.ts <入力.json> [-o <出力.html>]
  入力.json  乗換案内のデータ（形は SKILL.md を参照）
  -o         出力先。省略すると標準出力へ書く
  -h         この説明を表示する`

type Place = { 名称: string; 住所?: string }
type Stop = { 駅: string; 時刻: string }
type Walk = { 種類: "徒歩"; 分: number; メートル?: number }
type Ride = {
  種類: "乗車"
  路線: string
  色?: string
  記号?: string
  種別?: string
  行先: string
  発: Stop
  着: Stop
  停車駅?: string
  定刻?: boolean
  ホーム?: string
  乗換地点ID?: string
}
type Route = {
  出発地: Place
  目的地: Place
  出発: string
  到着: string
  運賃: number
  経路: (Walk | Ride)[]
}

class InputError extends Error {}

function fail(path: string, message: string): never {
  throw new InputError(`${path}: ${message}`)
}

type Obj = Record<string, unknown>

function asObject(value: unknown, path: string, allowed: readonly string[]): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "オブジェクトで指定する")
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(`${path}.${key}`, `未知の項目である（使える項目: ${allowed.join("、")}）`)
    }
  }
  return value as Obj
}

function text(o: Obj, key: string, path: string): string {
  const v = o[key]
  if (typeof v !== "string" || v.trim() === "") fail(`${path}.${key}`, "必須の文字列が未指定である")
  return v
}

function optText(o: Obj, key: string, path: string): string | undefined {
  if (o[key] === undefined) return undefined
  return text(o, key, path)
}

function clock(o: Obj, key: string, path: string): string {
  const v = text(o, key, path)
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(`${path}.${key}`, `時刻は H:MM か HH:MM で指定する（値: ${v}）`)
  return v
}

function count(o: Obj, key: string, path: string): number {
  const v = o[key]
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) fail(`${path}.${key}`, "0以上の整数で指定する")
  return v
}

function optCount(o: Obj, key: string, path: string): number | undefined {
  return o[key] === undefined ? undefined : count(o, key, path)
}

function lineColor(o: Obj, key: string, path: string): string | undefined {
  const v = optText(o, key, path)
  if (v !== undefined && !/^#[0-9a-fA-F]{6}$/.test(v)) fail(`${path}.${key}`, `色は #rrggbb で指定する（値: ${v}）`)
  return v
}

function place(value: unknown, path: string): Place {
  const o = asObject(value, path, ["名称", "住所"])
  return { 名称: text(o, "名称", path), 住所: optText(o, "住所", path) }
}

function stop(value: unknown, path: string): Stop {
  const o = asObject(value, path, ["駅", "時刻"])
  return { 駅: text(o, "駅", path), 時刻: clock(o, "時刻", path) }
}

function step(value: unknown, path: string): Walk | Ride {
  const kind = (value as Obj | null)?.種類
  if (kind === "徒歩") {
    const o = asObject(value, path, ["種類", "分", "メートル"])
    return { 種類: "徒歩", 分: count(o, "分", path), メートル: optCount(o, "メートル", path) }
  }
  if (kind === "乗車") {
    const o = asObject(value, path, [
      "種類", "路線", "色", "記号", "種別", "行先", "発", "着", "停車駅", "定刻", "ホーム", "乗換地点ID",
    ])
    if (o.定刻 !== undefined && typeof o.定刻 !== "boolean") fail(`${path}.定刻`, "true か false で指定する")
    return {
      種類: "乗車",
      路線: text(o, "路線", path),
      色: lineColor(o, "色", path),
      記号: optText(o, "記号", path),
      種別: optText(o, "種別", path),
      行先: text(o, "行先", path),
      発: stop(o.発, `${path}.発`),
      着: stop(o.着, `${path}.着`),
      停車駅: optText(o, "停車駅", path),
      定刻: o.定刻 as boolean | undefined,
      ホーム: optText(o, "ホーム", path),
      乗換地点ID: optText(o, "乗換地点ID", path),
    }
  }
  return fail(`${path}.種類`, `"徒歩" か "乗車" で指定する`)
}

function parse(value: unknown): Route {
  const o = asObject(value, "$", ["出発地", "目的地", "出発", "到着", "運賃", "経路"])
  if (!Array.isArray(o.経路) || o.経路.length === 0) fail("$.経路", "1件以上の配列で指定する")
  return {
    出発地: place(o.出発地, "$.出発地"),
    目的地: place(o.目的地, "$.目的地"),
    出発: clock(o, "出発", "$"),
    到着: clock(o, "到着", "$"),
    運賃: count(o, "運賃", "$"),
    経路: o.経路.map((s, i) => step(s, `$.経路[${i}]`)),
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

// 日付をまたぐ場合を考え、負になった差は24時間を足す。
const elapsed = (from: string, to: string) => (((minutes(to) - minutes(from)) % 1440) + 1440) % 1440

// WCAGの相対輝度。
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Googleマップは明るい路線色の上にも白文字を使うため白を基本とし、
// 白との対比が2未満になる明るい色のときだけ暗い文字へ切り替える。
const MIN_CONTRAST_WITH_WHITE = 2

function onLine(color: string | undefined): "light" | "dark" {
  if (color === undefined) return "light"
  return 1.05 / (luminance(color) + 0.05) >= MIN_CONTRAST_WITH_WHITE ? "light" : "dark"
}

// Googleマップの概要欄は短い徒歩を省く。観測では、乗換の徒歩が2分のときは省かれ、4分のときは表示された。
// 境界の3分は未確認である。
const SUMMARY_MIN_WALK_MINUTES = 3

const yen = (amount: number) => `${amount.toLocaleString("ja-JP")}円`

const lineVar = (color: string | undefined) => (color === undefined ? "" : ` style="--line-color:${color}"`)

const ICON_WALK = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.5" cy="2.5" r="1.3" fill="currentColor" stroke="none"/><path d="M9 5.5 7.2 9.2 9.2 12 8.6 15M7.2 9.2 4.6 11.2M9 6.2 11.6 8.2M9.2 12l2.3 3"/></svg>`
const ICON_TRAIN = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="1.5" width="10" height="10" rx="2.5"/><path d="M5.5 6h5M5 14.5l1.6-3M11 14.5l-1.6-3"/></svg>`

const symbolBadge = (r: Ride) =>
  `<span class="symbol"${lineVar(r.色)}>${r.記号 === undefined ? ICON_TRAIN : esc(r.記号)}</span>`

const chip = (r: Ride) => `<span class="chip" data-on="${onLine(r.色)}"${lineVar(r.色)}>${esc(r.路線)}</span>`

type Row =
  | { kind: "node"; time: string; name: string; sub?: string; end?: boolean }
  | { kind: "leg"; step: Walk | Ride }

// 乗車の前後に駅の節点を置き、同じ駅・同じ時刻で続く節点は1つにまとめる。
function buildRows(route: Route): Row[] {
  const rows: Row[] = [
    { kind: "node", time: route.出発, name: route.出発地.名称, sub: route.出発地.住所 },
  ]
  const pushNode = (time: string, name: string) => {
    const last = rows[rows.length - 1]
    if (last.kind === "node" && last.time === time && last.name === name && !last.sub && !last.end) return
    rows.push({ kind: "node", time, name })
  }
  for (const s of route.経路) {
    if (s.種類 === "徒歩") {
      rows.push({ kind: "leg", step: s })
      continue
    }
    pushNode(s.発.時刻, s.発.駅)
    rows.push({ kind: "leg", step: s })
    rows.push({ kind: "node", time: s.着.時刻, name: s.着.駅 })
  }
  rows.push({ kind: "node", time: route.到着, name: route.目的地.名称, sub: route.目的地.住所, end: true })
  return rows
}

function railOf(row: Row | undefined): Walk | Ride | undefined {
  return row?.kind === "leg" ? row.step : undefined
}

// 節点どうしが隣り合うとき（乗車の着駅と目的地など）は、歩行と同じ点線でつなぐ。
const railKind = (s: Walk | Ride | undefined) => (s?.種類 === "乗車" ? "ride" : "walk")

function renderRow(row: Row, prev: Row | undefined, next: Row | undefined): string {
  if (row.kind === "leg") {
    const s = row.step
    if (s.種類 === "徒歩") {
      const detail = `約 ${s.分} 分${s.メートル === undefined ? "" : `、${s.メートル} m`}`
      return `<li class="row leg" data-kind="walk"><div class="side">${ICON_WALK}</div><div class="body"><p class="head">徒歩</p><p class="detail nowrap">${esc(detail)}</p></div></li>`
    }
    const head = [chip(s), s.種別 ? `<span>${esc(s.種別)}</span>` : "", `<span>${esc(s.行先)}</span>`].join("")
    const stops = s.停車駅 === undefined ? "" : `（${esc(s.停車駅)}）`
    const extras = [
      s.定刻 ? `<span class="ontime">定刻</span>` : "",
      s.ホーム === undefined ? "" : esc(s.ホーム),
      s.乗換地点ID === undefined ? "" : `乗換地点 ID: ${esc(s.乗換地点ID)}`,
    ].filter(Boolean)
    const extraLine = extras.length === 0 ? "" : `<p class="detail">· ${extras.join(" · ")}</p>`
    return `<li class="row leg" data-kind="ride"${lineVar(s.色)}><div class="side">${symbolBadge(s)}</div><div class="body"><p class="head">${head}</p><p class="detail"><span class="nowrap">${elapsed(s.発.時刻, s.着.時刻)} 分</span>${stops}</p>${extraLine}</div></li>`
  }
  const before = railOf(prev)
  const after = railOf(next)
  const above = prev === undefined ? "none" : railKind(before)
  const below = next === undefined ? "none" : railKind(after)
  const vars = [
    before?.種類 === "乗車" && before.色 ? `--above-color:${before.色}` : "",
    after?.種類 === "乗車" && after.色 ? `--below-color:${after.色}` : "",
  ].filter(Boolean)
  const style = vars.length === 0 ? "" : ` style="${vars.join(";")}"`
  const sub = row.sub === undefined ? "" : `<p class="sub">${esc(row.sub)}</p>`
  return `<li class="row node${row.end ? " node-end" : ""}" data-above="${above}" data-below="${below}"${style}><div class="side"><time>${esc(row.time)}</time></div><span class="rail-dot"></span><div class="body"><p class="place">${esc(row.name)}</p>${sub}</div></li>`
}

function renderSummary(route: Route): string {
  const rides = route.経路.filter((s): s is Ride => s.種類 === "乗車")
  const walkMinutes = route.経路.reduce((sum, s) => sum + (s.種類 === "徒歩" ? s.分 : 0), 0)
  const legs = route.経路
    .filter((s) => s.種類 === "乗車" || s.分 >= SUMMARY_MIN_WALK_MINUTES)
    .map((s) => (s.種類 === "徒歩" ? `<li aria-label="徒歩">${ICON_WALK}</li>` : `<li>${symbolBadge(s)}${chip(s)}</li>`))
    .join("")
  const from =
    rides.length === 0 ? "" : `<p class="summary-meta">${esc(rides[0].発.駅)}から ${esc(rides[0].発.時刻)}</p>`
  const walk = walkMinutes === 0 ? "" : `<span class="nowrap">${ICON_WALK} ${walkMinutes} 分</span>`
  return `<section class="summary"><h1 class="summary-time"><span class="nowrap">${esc(route.出発)} - ${esc(route.到着)}</span> <small class="nowrap">（${elapsed(route.出発, route.到着)} 分）</small></h1><ol class="summary-legs">${legs}</ol>${from}<p class="summary-meta"><span class="fare-line"><span>${yen(route.運賃)}</span>${walk}</span></p></section>`
}

function render(route: Route, css: string): string {
  const rows = buildRows(route)
  const timeline = rows.map((row, i) => renderRow(row, rows[i - 1], rows[i + 1])).join("")
  const title = `${route.出発地.名称} → ${route.目的地.名称} ${route.出発}-${route.到着}`
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${css}</style>
</head>
<body>
<main class="route">
<header class="route-head"><p><span>出発地:</span> ${esc(route.出発地.名称)}</p><p><span>目的地:</span> ${esc(route.目的地.名称)}</p></header>
${renderSummary(route)}
<ol class="timeline">${timeline}</ol>
<p class="fare-note">料金: ${yen(route.運賃)}</p>
</main>
</body>
</html>
`
}

function main(argv: string[]) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE)
    return
  }
  const outIndex = argv.indexOf("-o")
  const output = outIndex === -1 ? undefined : argv[outIndex + 1]
  if (outIndex !== -1 && (output === undefined || output.startsWith("-"))) {
    throw new InputError("-o には出力先のパスを指定する")
  }
  const inputs = argv.filter((_, i) => i !== outIndex && i !== outIndex + 1)
  if (inputs.length !== 1) throw new InputError(`入力ファイルを1つ指定する\n${USAGE}`)

  let data: unknown
  try {
    data = JSON.parse(readFileSync(inputs[0], "utf8"))
  } catch (e) {
    throw new InputError(`入力を読めない: ${(e as Error).message}`)
  }
  const css = TEMPLATE_FILES.map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n")
  const html = render(parse(data), css)
  if (output === undefined) process.stdout.write(html)
  else writeFileSync(output, html)
}

try {
  main(process.argv.slice(2))
} catch (e) {
  if (!(e instanceof InputError)) throw e
  console.error(`エラー: ${e.message}`)
  process.exit(1)
}
