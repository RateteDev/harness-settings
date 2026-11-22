// 経路を、外部に依存しない1枚のHTMLにする。見た目は templates/*.css、アイコンは templates/アイコン/ が持つ。

import { readFileSync } from "node:fs"
import {
  isRide,
  MINUTES_PER_DAY,
  MOVE_KINDS,
  MS_PER_DAY,
  type Move,
  type MoveKind,
  type Place,
  type Ride,
  type Route,
  type Step,
  type Time,
  VEHICLES,
  type Vehicle,
} from "./route.ts"

// エスケープ済みのHTML。html`...` に差し込む値は、Markup でなければエスケープされる。
class Markup {
  constructor(readonly source: string) {}
}

type Part = Markup | string | number | false | undefined | Part[]

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

function toSource(part: Part): string {
  if (part instanceof Markup) return part.source
  if (Array.isArray(part)) return part.map(toSource).join("")
  return part === undefined || part === false ? "" : escapeHtml(String(part))
}

// 雛形の中の改行と字下げは出力しない。要素の間に空白が入ると、文字の間隔として表示に出るため。
function html(literals: TemplateStringsArray, ...parts: Part[]): Markup {
  return new Markup(literals.map((literal, i) => literal.replace(/\n\s*/g, "") + toSource(parts[i])).join(""))
}

const template = (name: string) => readFileSync(new URL(`../templates/${name}`, import.meta.url), "utf8")

const CSS = ["トークン.css", "乗換案内.css"].map(template).join("\n")

// 徒歩・電車・新幹線・地下鉄・路面電車はTemaki、バス・飛行機・船・自転車・タクシーはMakiから取った（どちらもCC0）。
const ICONS = Object.fromEntries(
  [...MOVE_KINDS, ...VEHICLES].map((name) => [name, new Markup(template(`アイコン/${name}.svg`).trim())]),
) as Record<MoveKind | Vehicle, Markup>

const separated = (items: Part[], separator: Part): Part[] =>
  items.flatMap((item, i) => (i === 0 ? [item] : [separator, item]))

// 1時間以上は「1 時間 50 分」の形にする。
const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} 分` : `${Math.floor(minutes / 60)} 時間${minutes % 60 === 0 ? "" : ` ${minutes % 60} 分`}`

const dayOf = (time: Time) => Math.floor(time.at / MINUTES_PER_DAY)

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

function dateLabel(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日(${WEEKDAYS[date.getUTCDay()]})`
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

const textOnLine = (color: string | undefined) =>
  color === undefined || 1.05 / (luminance(color) + 0.05) >= MIN_CONTRAST_WITH_WHITE ? "light" : "dark"

// 路線色をCSSへ渡す。色を省いた路線は何も渡さず、CSSが中立のグレーで描く。
const lineColors = (colors: Record<string, string | undefined>) => {
  const declarations = Object.entries(colors).filter(([, color]) => color !== undefined)
  return declarations.length > 0 && html` style="${declarations.map(([name, color]) => `${name}:${color}`).join(";")}"`
}

const symbol = (ride: Ride) =>
  ride.記号 === undefined
    ? html`<span class="symbol">${ICONS[ride.乗り物]}</span>`
    : html`<span class="symbol symbol-text">${ride.記号}</span>`

const chip = (ride: Ride) =>
  html`<span class="chip" data-on="${textOnLine(ride.色)}"${lineColors({ "--line-color": ride.色 })}>${ride.路線}</span>`

// 地点から上下に出る線。乗車は路線色の実線、徒歩などは点線で描く。
type Rail = { kind: "ride"; color?: string } | { kind: "move" }

type Point = { kind: "point"; time: Time; name: string; notes: string[]; goal: boolean }
type Row = Point | { kind: "leg"; step: Step }

const point = (time: Time, name: string, note?: string, goal = false): Point => ({
  kind: "point",
  time,
  name,
  notes: note === undefined ? [] : [note],
  goal,
})

const endpoint = (time: Time, place: Place, goal: boolean) => point(time, place.名称, place.住所, goal)

function timelineRows(route: Route): Row[] {
  const rows: Row[] = [endpoint(route.出発, route.出発地, false)]
  for (const step of route.経路) {
    if (isRide(step)) {
      // 直前の地点と名称も時刻も同じなら、乗る地点を重ねて出さない（直通や、乗換の徒歩がない乗り継ぎ）。
      const last = rows[rows.length - 1]
      const repeated =
        last.kind === "point" && last.time.at === step.発.時刻.at && last.name === step.発.地点 && last.notes.length === 0
      if (!repeated) rows.push(point(step.発.時刻, step.発.地点))
    }
    rows.push({ kind: "leg", step })
    if (isRide(step)) rows.push(point(step.着.時刻, step.着.地点))
  }
  rows.push(endpoint(route.到着, route.目的地, true))

  // 日付を使うときは、前の地点から日が変わった地点に日付を添える。
  if (route.日付あり) {
    let day = dayOf(route.出発)
    for (const row of rows) {
      if (row.kind !== "point" || dayOf(row.time) === day) continue
      day = dayOf(row.time)
      row.notes.push(dateLabel(day))
    }
  }
  return rows
}

// 地点どうしが隣り合うとき（乗車の着地点と目的地など）は、徒歩などと同じ点線でつなぐ。
function railOf(neighbor: Row | undefined): Rail | undefined {
  if (neighbor === undefined) return undefined
  return neighbor.kind === "leg" && isRide(neighbor.step) ? { kind: "ride", color: neighbor.step.色 } : { kind: "move" }
}

function pointRow(row: Point, above: Rail | undefined, below: Rail | undefined): Markup {
  const colors = lineColors({
    "--above-color": above?.kind === "ride" ? above.color : undefined,
    "--below-color": below?.kind === "ride" ? below.color : undefined,
  })
  const rails = html` data-above="${above?.kind ?? "none"}" data-below="${below?.kind ?? "none"}"`
  return html`
    <li class="row point${row.goal && " point-goal"}"${rails}${colors}>
      <div class="side"><time>${row.time.text}</time></div>
      <div class="rail"><span class="rail-dot"></span></div>
      <div class="body">
        <p class="place">${row.name}</p>
        ${row.notes.map((note) => html`<p class="sub">${note}</p>`)}
      </div>
    </li>`
}

function moveRow(move: Move): Markup {
  return html`
    <li class="row leg" data-kind="move">
      <div class="side">${ICONS[move.種類]}</div>
      <div class="rail"></div>
      <div class="body">
        <p class="head">${move.種類}</p>
        <p class="detail nowrap">約 ${duration(move.分)}${move.メートル !== undefined && `、${move.メートル} m`}</p>
      </div>
    </li>`
}

function rideRow(ride: Ride): Markup {
  const extras = [
    ride.定刻 && html`<span class="ontime">定刻</span>`,
    ride.ホーム,
    ride.乗換地点ID !== undefined && `乗換地点 ID: ${ride.乗換地点ID}`,
  ]
    .filter(Boolean)
    .map((extra) => html`<span class="nowrap">· ${extra}</span>`)
  return html`
    <li class="row leg" data-kind="ride"${lineColors({ "--line-color": ride.色 })}>
      <div class="side">${symbol(ride)}</div>
      <div class="rail"></div>
      <div class="body">
        <p class="head">
          ${chip(ride)}
          ${ride.種別 !== undefined && html`<span>${ride.種別}</span>`}
          <span>${ride.行先}</span>
        </p>
        <p class="detail">
          <span class="nowrap">${duration(ride.着.時刻.at - ride.発.時刻.at)}</span>
          ${ride.停車 !== undefined && html`<span class="nowrap">（${ride.停車}）</span>`}
        </p>
        ${extras.length > 0 && html`<p class="detail">${separated(extras, " ")}</p>`}
      </div>
    </li>`
}

function timeline(route: Route): Markup {
  const rows = timelineRows(route)
  return html`<ol class="timeline">${rows.map((row, i) => {
    if (row.kind === "point") return pointRow(row, railOf(rows[i - 1]), railOf(rows[i + 1]))
    return isRide(row.step) ? rideRow(row.step) : moveRow(row.step)
  })}</ol>`
}

// Googleマップの概要欄は短い徒歩を省く。観測では、乗換の徒歩が2分のときは省かれ、4分のときは表示された。
// 境界の3分は未確認で、自転車とタクシーにも同じ基準を当てている。
const SUMMARY_MIN_MOVE_MINUTES = 3

// 概要欄の並びを、折り返してよい組に分ける。乗換の徒歩などは次の乗車と同じ組にし、徒歩の記号だけが行に残らないようにする。
function summaryGroups(route: Route): Step[][] {
  const shown = route.経路.filter((step) => isRide(step) || step.分 >= SUMMARY_MIN_MOVE_MINUTES)
  const groups: Step[][] = [[]]
  shown.forEach((step, i) => {
    const group = groups[groups.length - 1]
    // 最後の徒歩などは、続く乗車がないため直前の乗車の組に入れる。
    const closing = !isRide(step) && i === shown.length - 1
    if (group.some(isRide) && !closing) groups.push([step])
    else group.push(step)
  })
  return groups.filter((group) => group.length > 0)
}

function summary(route: Route): Markup {
  const arrow = html`<span class="sep" aria-hidden="true">›</span>`
  const groups = summaryGroups(route).map((group, i, all) => {
    const items = group.map((step) =>
      isRide(step) ? html`${symbol(step)}${chip(step)}` : html`<span aria-label="${step.種類}">${ICONS[step.種類]}</span>`,
    )
    return html`<li class="leg-group">${separated(items, arrow)}${i < all.length - 1 && arrow}</li>`
  })
  const firstRide = route.経路.find(isRide)
  const totals = MOVE_KINDS.map((kind) => {
    const minutes = route.経路.reduce((sum, step) => sum + (step.種類 === kind ? step.分 : 0), 0)
    return minutes > 0 && html`<span class="nowrap" aria-label="${kind}">${ICONS[kind]} ${duration(minutes)}</span>`
  }).filter(Boolean)

  const fare = html`<p class="summary-fare">${route.運賃.toLocaleString("ja-JP")}円</p>`
  const time = html`
    <h1 class="summary-time">
      <span class="nowrap">${route.出発.text} - ${route.到着.text}</span>${" "}
      <small class="nowrap">（${duration(route.到着.at - route.出発.at)}）</small>
    </h1>`
  const [from, to] = [dayOf(route.出発), dayOf(route.到着)]
  // 日付がないときは、日付の行を作らず、運賃を時間の行の右端に置く。
  const head = route.日付あり
    ? html`
      <div class="summary-top">
        <p class="summary-date">${dateLabel(from)}${to !== from && ` - ${dateLabel(to)}`}</p>
        ${fare}
      </div>
      ${time}`
    : html`<div class="summary-head">${time}${fare}</div>`
  return html`
    <section class="summary"${route.日付あり && new Markup(" data-dated")}>
      ${head}
      <ol class="summary-legs">${groups}</ol>
      ${firstRide && html`<p class="summary-meta">${firstRide.発.地点}から ${firstRide.発.時刻.text}</p>`}
      ${totals.length > 0 && html`<p class="summary-meta summary-totals">${totals}</p>`}
    </section>`
}

export function renderPage(route: Route): string {
  const page = html`
    <main class="route">
      <header class="route-head">
        <p><span>出発地:</span> ${route.出発地.名称}</p>
        <p><span>目的地:</span> ${route.目的地.名称}</p>
      </header>
      ${summary(route)}
      ${timeline(route)}
    </main>`
  const title = `${route.出発地.名称} → ${route.目的地.名称} ${route.出発.text}-${route.到着.text}`
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${CSS}</style>
</head>
<body>
${page.source}
</body>
</html>
`
}
