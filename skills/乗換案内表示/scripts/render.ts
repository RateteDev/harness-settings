#!/usr/bin/env bun

// 乗換案内のJSONを、外部に依存しない1枚のHTMLにする。
// 入力の形は SKILL.md と templates/例.json に示す。

import { readFileSync, writeFileSync } from "node:fs"

const TEMPLATE_FILES = ["../templates/トークン.css", "../templates/乗換案内.css"] as const

const USAGE = `使い方: render.ts <入力.json> [-o <出力.html>]
  入力.json  乗換案内のデータ（形は SKILL.md を参照）
  -o         出力先。省略すると標準出力へ書く
  -h         この説明を表示する`

const VEHICLES = ["電車", "新幹線", "地下鉄", "路面電車", "バス", "飛行機", "船"] as const
const MOVES = ["徒歩", "自転車", "タクシー"] as const
type Vehicle = (typeof VEHICLES)[number]
type MoveKind = (typeof MOVES)[number]

// templates/アイコン/{名前}.svg を名前で引く。徒歩・電車・新幹線・地下鉄・路面電車はTemaki、
// バス・飛行機・船・自転車・タクシーはMakiから取った（どちらもCC0）。
const ICONS: Record<string, string> = {}

function loadIcons() {
  for (const name of [...MOVES, ...VEHICLES]) {
    ICONS[name] = readFileSync(new URL(`../templates/アイコン/${name}.svg`, import.meta.url), "utf8").trim()
  }
}

type Clock = { path: string; text: string; hour: number; minute: number; epochDay?: number; abs: number }
type Place = { 名称: string; 住所?: string }
type Stop = { 駅: string; 時刻: Clock }
type Move = { 種類: MoveKind; 分: number; メートル?: number }
type Ride = {
  種類: "乗車"
  乗り物: Vehicle
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
type Step = Move | Ride
type Route = {
  出発地: Place
  目的地: Place
  出発: Clock
  到着: Clock
  運賃: number
  経路: Step[]
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

const MS_PER_DAY = 86_400_000

// 日付は「YYYY-MM-DD 」を時刻の前に付けたときだけ読み取る。
function clock(o: Obj, key: string, path: string): Clock {
  const v = text(o, key, path)
  const m = /^(?:(\d{4})-(\d{2})-(\d{2}) )?(\d{1,2}):(\d{2})$/.exec(v)
  const hour = Number(m?.[4])
  const minute = Number(m?.[5])
  if (!m || hour > 23 || minute > 59) {
    fail(`${path}.${key}`, `時刻は H:MM か HH:MM で指定する。日付を付けるときは YYYY-MM-DD を前に置く（値: ${v}）`)
  }
  let epochDay: number | undefined
  if (m[1] !== undefined) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const t = new Date(Date.UTC(y, mo - 1, d))
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
      fail(`${path}.${key}`, `存在しない日付である（値: ${v}）`)
    }
    epochDay = t.getTime() / MS_PER_DAY
  }
  return { path: `${path}.${key}`, text: `${m[4]}:${m[5]}`, hour, minute, epochDay, abs: 0 }
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

const isMove = (kind: unknown): kind is MoveKind => (MOVES as readonly unknown[]).includes(kind)

function step(value: unknown, path: string): Step {
  const kind = (value as Obj | null)?.種類
  if (isMove(kind)) {
    const o = asObject(value, path, ["種類", "分", "メートル"])
    return { 種類: kind, 分: count(o, "分", path), メートル: optCount(o, "メートル", path) }
  }
  if (kind === "乗車") {
    const o = asObject(value, path, [
      "種類", "乗り物", "路線", "色", "記号", "種別", "行先", "発", "着", "停車駅", "定刻", "ホーム", "乗換地点ID",
    ])
    if (o.定刻 !== undefined && typeof o.定刻 !== "boolean") fail(`${path}.定刻`, "true か false で指定する")
    const vehicle = o.乗り物 ?? "電車"
    if (!(VEHICLES as readonly unknown[]).includes(vehicle)) {
      fail(`${path}.乗り物`, `${VEHICLES.join("、")} のいずれかで指定する`)
    }
    return {
      種類: "乗車",
      乗り物: vehicle as Vehicle,
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
  return fail(`${path}.種類`, `${[...MOVES, "乗車"].join("、")} のいずれかで指定する`)
}

function parse(value: unknown): Route {
  const o = asObject(value, "$", ["出発地", "目的地", "出発", "到着", "運賃", "経路"])
  if (!Array.isArray(o.経路) || o.経路.length === 0) fail("$.経路", "1件以上の配列で指定する")
  const route: Route = {
    出発地: place(o.出発地, "$.出発地"),
    目的地: place(o.目的地, "$.目的地"),
    出発: clock(o, "出発", "$"),
    到着: clock(o, "到着", "$"),
    運賃: count(o, "運賃", "$"),
    経路: o.経路.map((s, i) => step(s, `$.経路[${i}]`)),
  }
  resolveTimes(route)
  return route
}

// 時刻を出発からの通し分に直す。日付のない時刻は、直前より前なら翌日とみなす。
// 日付を付けた時刻は、その日付を優先する。
function resolveTimes(route: Route) {
  const sequence = [
    route.出発,
    ...route.経路.flatMap((s) => (s.種類 === "乗車" ? [s.発.時刻, s.着.時刻] : [])),
    route.到着,
  ]
  if (route.出発.epochDay === undefined && sequence.some((c) => c.epochDay !== undefined)) {
    fail(route.出発.path, "日付を使うときは出発にも日付を付ける")
  }
  let previous = 0
  sequence.forEach((c, i) => {
    const minuteOfDay = c.hour * 60 + c.minute
    if (c.epochDay !== undefined) {
      c.abs = c.epochDay * 1440 + minuteOfDay
      if (i > 0 && c.abs < previous) fail(c.path, "直前の時刻より前になっている")
    } else if (i === 0) {
      c.abs = minuteOfDay
    } else {
      c.abs = Math.floor(previous / 1440) * 1440 + minuteOfDay
      if (c.abs < previous) c.abs += 1440
    }
    previous = c.abs
  })
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

const elapsed = (from: Clock, to: Clock) => to.abs - from.abs
const dayOf = (c: Clock) => Math.floor(c.abs / 1440)

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

function dateLabel(epochDay: number): string {
  const d = new Date(epochDay * MS_PER_DAY)
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS[d.getUTCDay()]})`
}

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
// 境界の3分は未確認で、自転車とタクシーにも同じ基準を当てている。
const SUMMARY_MIN_MOVE_MINUTES = 3

// 1時間以上は「1 時間 50 分」の形にする。
const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} 分` : `${Math.floor(minutes / 60)} 時間${minutes % 60 === 0 ? "" : ` ${minutes % 60} 分`}`

const yen = (amount: number) => `${amount.toLocaleString("ja-JP")}円`

const lineVar = (color: string | undefined) => (color === undefined ? "" : ` style="--line-color:${color}"`)

const symbolBadge = (r: Ride) =>
  r.記号 === undefined
    ? `<span class="symbol">${ICONS[r.乗り物]}</span>`
    : `<span class="symbol symbol-text">${esc(r.記号)}</span>`

const chip = (r: Ride) => `<span class="chip" data-on="${onLine(r.色)}"${lineVar(r.色)}>${esc(r.路線)}</span>`

type Row =
  | { kind: "node"; clock: Clock; name: string; sub?: string; end?: boolean; dateLabel?: string }
  | { kind: "leg"; step: Step }

// 乗車の前後に駅の節点を置き、同じ駅・同じ時刻で続く節点は1つにまとめる。
// 日付を使うときは、前の節点から日が変わった節点に日付を付ける。
function buildRows(route: Route): Row[] {
  const rows: Row[] = [
    { kind: "node", clock: route.出発, name: route.出発地.名称, sub: route.出発地.住所 },
  ]
  const pushNode = (clock: Clock, name: string) => {
    const last = rows[rows.length - 1]
    if (last.kind === "node" && last.clock.abs === clock.abs && last.name === name && !last.sub && !last.end) return
    rows.push({ kind: "node", clock, name })
  }
  for (const s of route.経路) {
    if (s.種類 !== "乗車") {
      rows.push({ kind: "leg", step: s })
      continue
    }
    pushNode(s.発.時刻, s.発.駅)
    rows.push({ kind: "leg", step: s })
    rows.push({ kind: "node", clock: s.着.時刻, name: s.着.駅 })
  }
  rows.push({ kind: "node", clock: route.到着, name: route.目的地.名称, sub: route.目的地.住所, end: true })
  if (route.出発.epochDay !== undefined) {
    let day = dayOf(route.出発)
    for (const row of rows) {
      if (row.kind !== "node" || dayOf(row.clock) === day) continue
      day = dayOf(row.clock)
      row.dateLabel = dateLabel(day)
    }
  }
  return rows
}

function railOf(row: Row | undefined): Step | undefined {
  return row?.kind === "leg" ? row.step : undefined
}

// 節点どうしが隣り合うとき（乗車の着駅と目的地など）は、徒歩などと同じ点線でつなぐ。
const railKind = (s: Step | undefined) => (s?.種類 === "乗車" ? "ride" : "move")

function renderRow(row: Row, prev: Row | undefined, next: Row | undefined): string {
  if (row.kind === "leg") {
    const s = row.step
    if (s.種類 !== "乗車") {
      const detail = `約 ${duration(s.分)}${s.メートル === undefined ? "" : `、${s.メートル} m`}`
      return `<li class="row leg" data-kind="move"><div class="side">${ICONS[s.種類]}</div><div class="rail"></div><div class="body"><p class="head">${s.種類}</p><p class="detail nowrap">${esc(detail)}</p></div></li>`
    }
    const head = [chip(s), s.種別 ? `<span>${esc(s.種別)}</span>` : "", `<span>${esc(s.行先)}</span>`].join("")
    const stops = s.停車駅 === undefined ? "" : `<span class="nowrap">（${esc(s.停車駅)}）</span>`
    const extras = [
      s.定刻 ? `<span class="ontime">定刻</span>` : "",
      s.ホーム === undefined ? "" : esc(s.ホーム),
      s.乗換地点ID === undefined ? "" : `乗換地点 ID: ${esc(s.乗換地点ID)}`,
    ]
      .filter(Boolean)
      .map((item) => `<span class="nowrap">· ${item}</span>`)
    const extraLine = extras.length === 0 ? "" : `<p class="detail">${extras.join(" ")}</p>`
    return `<li class="row leg" data-kind="ride"${lineVar(s.色)}><div class="side">${symbolBadge(s)}</div><div class="rail"></div><div class="body"><p class="head">${head}</p><p class="detail"><span class="nowrap">${duration(elapsed(s.発.時刻, s.着.時刻))}</span>${stops}</p>${extraLine}</div></li>`
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
  const subs = [row.sub, row.dateLabel]
    .filter((t): t is string => t !== undefined)
    .map((t) => `<p class="sub">${esc(t)}</p>`)
    .join("")
  return `<li class="row node${row.end ? " node-end" : ""}" data-above="${above}" data-below="${below}"${style}><div class="side"><time>${esc(row.clock.text)}</time></div><div class="rail"><span class="rail-dot"></span></div><div class="body"><p class="place">${esc(row.name)}</p>${subs}</div></li>`
}

const isRide = (s: Step): s is Ride => s.種類 === "乗車"

// 乗換の徒歩などは次の乗車と、最後の徒歩などは直前の乗車と同じ組にし、折り返しは組の間だけで起こす。
function summaryGroups(steps: Step[]): Step[][] {
  const groups: Step[][] = []
  let current: Step[] = []
  steps.forEach((s, i) => {
    const hasRide = current.some(isRide)
    if (isRide(s)) {
      if (hasRide) {
        groups.push(current)
        current = []
      }
      current.push(s)
    } else if (hasRide && i < steps.length - 1) {
      groups.push(current)
      current = [s]
    } else {
      current.push(s)
    }
  })
  if (current.length > 0) groups.push(current)
  return groups
}

function renderSummary(route: Route): string {
  const rides = route.経路.filter(isRide)
  const visible = route.経路.filter((s) => isRide(s) || s.分 >= SUMMARY_MIN_MOVE_MINUTES)
  const legs = summaryGroups(visible)
    .map((group) => {
      const items = group.map((s) =>
        isRide(s) ? `${symbolBadge(s)}${chip(s)}` : `<span aria-label="${s.種類}">${ICONS[s.種類]}</span>`,
      )
      return `<li class="leg-group">${items.join(`<span class="sep" aria-hidden="true">›</span>`)}</li>`
    })
    .join("")
  const from =
    rides.length === 0 ? "" : `<p class="summary-meta">${esc(rides[0].発.駅)}から ${esc(rides[0].発.時刻.text)}</p>`
  const totals = MOVES.map((kind) => {
    const minutes = route.経路.reduce((sum, s) => sum + (s.種類 === kind ? s.分 : 0), 0)
    return minutes === 0 ? "" : `<span class="nowrap" aria-label="${kind}">${ICONS[kind]} ${duration(minutes)}</span>`
  }).join("")
  const totalsLine = totals === "" ? "" : `<p class="summary-meta summary-totals">${totals}</p>`
  let dates = ""
  if (route.出発.epochDay !== undefined) {
    const arrival = dayOf(route.到着) === dayOf(route.出発) ? "" : ` - ${dateLabel(dayOf(route.到着))}`
    dates = `<p class="summary-date">${dateLabel(dayOf(route.出発))}${arrival}</p>`
  }
  const fare = `<p class="summary-fare">${yen(route.運賃)}</p>`
  const heading = `<h1 class="summary-time"><span class="nowrap">${esc(route.出発.text)} - ${esc(route.到着.text)}</span> <small class="nowrap">（${duration(elapsed(route.出発, route.到着))}）</small></h1>`
  // 日付がないときは、日付の行を作らず、運賃を時間の行の右端に置く。
  const head =
    dates === ""
      ? `<div class="summary-head">${heading}${fare}</div>`
      : `<div class="summary-top">${dates}${fare}</div>${heading}`
  return `<section class="summary"${dates === "" ? "" : " data-dated"}>${head}<ol class="summary-legs">${legs}</ol>${from}${totalsLine}</section>`
}

function render(route: Route, css: string): string {
  const rows = buildRows(route)
  const timeline = rows.map((row, i) => renderRow(row, rows[i - 1], rows[i + 1])).join("")
  const title = `${route.出発地.名称} → ${route.目的地.名称} ${route.出発.text}-${route.到着.text}`
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
  const inputs = outIndex === -1 ? argv : argv.filter((_, i) => i !== outIndex && i !== outIndex + 1)
  if (inputs.length !== 1) throw new InputError(`入力ファイルを1つ指定する\n${USAGE}`)

  let data: unknown
  try {
    data = JSON.parse(readFileSync(inputs[0], "utf8"))
  } catch (e) {
    throw new InputError(`入力を読めない: ${(e as Error).message}`)
  }
  loadIcons()
  const css = TEMPLATE_FILES.map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n")
  const html = render(parse(data), css)
  if (output === undefined) process.stdout.write(html)
  else writeFileSync(output, html)
}

try {
  main(process.argv.slice(2))
} catch (e) {
  if (!(e instanceof Error)) throw e
  console.error(`エラー: ${e.message}`)
  process.exit(1)
}
