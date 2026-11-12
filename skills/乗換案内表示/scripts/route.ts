// 入力のJSONを検証し、時刻を通し分に直した経路にする。項目の意味は SKILL.md の表に示す。

export const MOVE_KINDS = ["徒歩", "自転車", "タクシー"] as const
export const VEHICLES = ["電車", "新幹線", "地下鉄", "路面電車", "バス", "飛行機", "船"] as const
export type MoveKind = (typeof MOVE_KINDS)[number]
export type Vehicle = (typeof VEHICLES)[number]

export const MINUTES_PER_DAY = 1440
export const MS_PER_DAY = 86_400_000

// at は通し分。日付を使う経路では1970-01-01の0時から、使わない経路では出発日の0時から数える。
export type Time = { text: string; at: number }
export type Place = { 名称: string; 住所?: string }
export type Stop = { 地点: string; 時刻: Time }
export type Move = { 種類: MoveKind; 分: number; メートル?: number }
export type Ride = {
  種類: "乗車"
  乗り物: Vehicle
  路線: string
  色?: string
  記号?: string
  種別?: string
  行先: string
  発: Stop
  着: Stop
  停車?: string
  定刻?: boolean
  ホーム?: string
  乗換地点ID?: string
}
export type Step = Move | Ride
export type Route = {
  出発地: Place
  目的地: Place
  出発: Time
  到着: Time
  日付あり: boolean
  運賃: number
  経路: Step[]
}

export const isRide = (step: Step): step is Ride => step.種類 === "乗車"

export class InputError extends Error {}

function fail(path: string, message: string): never {
  throw new InputError(`${path}: ${message}`)
}

type Reader<T> = (value: unknown, path: string) => T

// オブジェクトの項目を読む。読んだ項目を覚えておき、done で読まなかった項目を未知として弾く。
// 使える項目の一覧を別に持たないのは、読む処理と一覧がずれないようにするため。
class Fields {
  private readonly value: Record<string, unknown>
  private readonly known: string[] = []

  constructor(
    value: unknown,
    private readonly path: string,
  ) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "オブジェクトで指定する")
    this.value = value as Record<string, unknown>
  }

  req<T>(key: string, read: Reader<T>): T {
    if (this.value[key] === undefined) {
      this.known.push(key)
      fail(`${this.path}.${key}`, "必須の項目が未指定である")
    }
    return this.opt(key, read) as T
  }

  opt<T>(key: string, read: Reader<T>): T | undefined {
    this.known.push(key)
    const value = this.value[key]
    return value === undefined ? undefined : read(value, `${this.path}.${key}`)
  }

  done<T>(result: T): T {
    for (const key of Object.keys(this.value)) {
      if (!this.known.includes(key)) {
        fail(`${this.path}.${key}`, `未知の項目である（使える項目: ${this.known.join("、")}）`)
      }
    }
    return result
  }
}

const text: Reader<string> = (value, path) =>
  typeof value === "string" && value.trim() !== "" ? value : fail(path, "空でない文字列で指定する")

const count: Reader<number> = (value, path) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fail(path, "0以上の整数で指定する")

const flag: Reader<boolean> = (value, path) =>
  typeof value === "boolean" ? value : fail(path, "true か false で指定する")

const color: Reader<string> = (value, path) =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fail(path, `色は #rrggbb で指定する（値: ${String(value)}）`)

const oneOf =
  <T extends string>(choices: readonly T[]): Reader<T> =>
  (value, path) =>
    (choices as readonly unknown[]).includes(value)
      ? (value as T)
      : fail(path, `${choices.join("、")} のいずれかで指定する`)

const nonEmptyList =
  <T>(item: Reader<T>): Reader<T[]> =>
  (value, path) =>
    Array.isArray(value) && value.length > 0
      ? value.map((element, i) => item(element, `${path}[${i}]`))
      : fail(path, "1件以上の配列で指定する")

const place: Reader<Place> = (value, path) => {
  const f = new Fields(value, path)
  return f.done({ 名称: f.req("名称", text), 住所: f.opt("住所", text) })
}

type Clock = { text: string; minuteOfDay: number; epochDay?: number }

// 日付は「YYYY-MM-DD 」を時刻の前に付けたときだけ読み取る。
const clock: Reader<Clock> = (value, path) => {
  const source = text(value, path)
  const m = /^(?:(\d{4})-(\d{2})-(\d{2}) )?(\d{1,2}):(\d{2})$/.exec(source)
  const [hour, minute] = [Number(m?.[4]), Number(m?.[5])]
  if (!m || hour > 23 || minute > 59) {
    fail(path, `時刻は H:MM か HH:MM で指定する。日付を付けるときは YYYY-MM-DD を前に置く（値: ${source}）`)
  }
  const time: Clock = { text: `${m[4]}:${m[5]}`, minuteOfDay: hour * 60 + minute }
  if (m[1] === undefined) return time
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail(path, `存在しない日付である（値: ${source}）`)
  }
  return { ...time, epochDay: date.getTime() / MS_PER_DAY }
}

// 経路の時刻を、並び順に1つずつ読む読み手を作る。
// 日付のない時刻は直前の時刻と同じ日に置き、直前より前になるなら翌日とみなす。日付のある時刻はその日付に従う。
function timeSequence() {
  let first: { path: string; dated: boolean } | undefined
  let previous = 0
  const read: Reader<Time> = (value, path) => {
    const { text, minuteOfDay, epochDay } = clock(value, path)
    let at: number
    if (first === undefined) {
      first = { path, dated: epochDay !== undefined }
      at = (epochDay ?? 0) * MINUTES_PER_DAY + minuteOfDay
    } else if (epochDay !== undefined) {
      if (!first.dated) fail(first.path, "日付を使うときは出発にも日付を付ける")
      at = epochDay * MINUTES_PER_DAY + minuteOfDay
      if (at < previous) fail(path, "直前の時刻より前になっている")
    } else {
      at = Math.floor(previous / MINUTES_PER_DAY) * MINUTES_PER_DAY + minuteOfDay
      if (at < previous) at += MINUTES_PER_DAY
    }
    previous = at
    return { text, at }
  }
  return { read, dated: () => first?.dated ?? false }
}

const step =
  (time: Reader<Time>): Reader<Step> =>
  (value, path) => {
    const f = new Fields(value, path)
    const 種類 = f.req("種類", oneOf([...MOVE_KINDS, "乗車"] as const))
    if (種類 !== "乗車") return f.done({ 種類, 分: f.req("分", count), メートル: f.opt("メートル", count) })
    const stop: Reader<Stop> = (v, p) => {
      const s = new Fields(v, p)
      return s.done({ 地点: s.req("地点", text), 時刻: s.req("時刻", time) })
    }
    return f.done({
      種類,
      乗り物: f.opt("乗り物", oneOf(VEHICLES)) ?? "電車",
      路線: f.req("路線", text),
      色: f.opt("色", color),
      記号: f.opt("記号", text),
      種別: f.opt("種別", text),
      行先: f.req("行先", text),
      発: f.req("発", stop),
      着: f.req("着", stop),
      停車: f.opt("停車", text),
      定刻: f.opt("定刻", flag),
      ホーム: f.opt("ホーム", text),
      乗換地点ID: f.opt("乗換地点ID", text),
    })
  }

export function parseRoute(value: unknown): Route {
  const f = new Fields(value, "$")
  const times = timeSequence()
  const 出発地 = f.req("出発地", place)
  const 目的地 = f.req("目的地", place)
  // 時刻は、出発・経路の発と着・到着の順に読む。翌日かどうかを直前の時刻から決めるため。
  const 出発 = f.req("出発", times.read)
  const 経路 = f.req("経路", nonEmptyList(step(times.read)))
  const 到着 = f.req("到着", times.read)
  const 運賃 = f.req("運賃", count)
  return f.done({ 出発地, 目的地, 出発, 到着, 日付あり: times.dated(), 運賃, 経路 })
}
