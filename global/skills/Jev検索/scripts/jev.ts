#!/usr/bin/env bun

// 分割の上限はAPI側の制限（state・1リクエストの大きさ）に合わせた値で、超えるとリクエストが弾かれる。
// 課金は入力量に比例するため、同時実行は控えめにしている。
const SETTINGS = {
  model: "jev-latest",
  endpoint: "https://api.typesafe.ai/v1/systemone",
  batchSize: 100,
  concurrency: 4,
  requestMaxBytes: 60_000,
  stateMaxBytes: 28_000,
  timeoutMs: 45_000,
} as const

// 候補ごとの評価問題。
const QUESTION =
  "Given the user's request, does this candidate concern the same subject, problem, " +
  "or goal, such that investigating it would contribute to fulfilling the request?"

const CRITERIA = {
  true:
    "The candidate plausibly addresses, reports, or informs the subject of the request, " +
    "including supporting context, examples, or related material.",
  false:
    "The candidate concerns unrelated subject matter, or generic material with no " +
    "task-specific bearing on the request.",
} as const

const MAX_ATTEMPTS = 4
const BACKOFF_BASE_MS = 1_000
const RETRY_DELAY_CAP_MS = 60_000

const USAGE = `jev - Rank candidate lines by relevance to a request through the Jev API.

Usage:
  jev --request <text> --candidates <file|-> [--limit <n>]

Options:
  --request <text>     Request that candidates are ranked against.
  --candidates <file>  File with one candidate per line. Use - for stdin.
  --limit <n>          Number of top candidates to return.
  --help               Show this help.

Environment:
  TYPESAFE_API_KEY     API key. Required.

Output:
  TSV of "<score><TAB><candidate>", highest score first.
  score is a probability between 0 and 1.

Cost:
  Each call is billed by input token usage.`

type Question = {
  type: "noul"
  instructions: { question: string; candidate: string }
  criteria: typeof CRITERIA
}
type RequestBody = {
  model: string
  state: { user_request: string }
  questions: Record<string, Question>
}
type Batch = { body: RequestBody; candidates: string[] }
type Options = { request: string; candidates: string; limit?: number }
type Scored = { candidate: string; score: number }

function fail(message: string): never {
  console.error(`jev: ${message}`)
  process.exit(1)
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_response")
  return value as Record<string, unknown>
}

function parseArgs(argv: string[]): Options | undefined {
  let request: string | undefined
  let candidates: string | undefined
  let limit: number | undefined
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === "--help" || flag === "-h") return undefined
    if (flag === "--request" || flag === "--candidates" || flag === "--limit") {
      const value = argv[++i]
      if (value === undefined) fail(`missing value for ${flag}`)
      if (flag === "--request") request = value
      else if (flag === "--candidates") candidates = value
      else {
        limit = Number(value)
        if (!Number.isSafeInteger(limit) || limit < 1) fail("--limit must be a positive integer")
      }
      continue
    }
    fail(`unknown option: ${flag}\nusage: jev --request <text> --candidates <file|-> [--limit <n>]`)
  }
  if (request === undefined) fail("missing required option: --request")
  if (candidates === undefined) fail("missing required option: --candidates")
  if (!request.trim()) fail("--request is empty")
  return { request, candidates, limit }
}

function questionFor(candidate: string): Question {
  return { type: "noul", instructions: { question: QUESTION, candidate }, criteria: CRITERIA }
}

function bodyFor(task: string, candidates: string[]): RequestBody {
  return {
    model: SETTINGS.model,
    state: { user_request: task },
    questions: Object.fromEntries(candidates.map((candidate, i) => [`c_${i}`, questionFor(candidate)])),
  }
}

// stateと最長questionの予算、1リクエストの総量の双方で分割する。
function planBatches(task: string, candidates: string[]): Batch[] {
  const stateBytes = Buffer.byteLength(JSON.stringify({ user_request: task }))
  if (stateBytes > SETTINGS.stateMaxBytes) throw new Error("task_too_large")
  const batches: Batch[] = []
  let batch: string[] = []
  for (const candidate of candidates) {
    const question = questionFor(candidate)
    if (stateBytes + Buffer.byteLength(JSON.stringify(question)) > SETTINGS.stateMaxBytes) {
      throw new Error("task_too_large")
    }
    const next = [...batch, candidate]
    if (
      next.length > SETTINGS.batchSize ||
      Buffer.byteLength(JSON.stringify(bodyFor(task, next))) > SETTINGS.requestMaxBytes
    ) {
      if (batch.length) batches.push({ body: bodyFor(task, batch), candidates: batch })
      batch = []
    }
    batch.push(candidate)
  }
  if (batch.length) batches.push({ body: bodyFor(task, batch), candidates: batch })
  return batches
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after")
  if (header !== null) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.round(seconds * 1000), RETRY_DELAY_CAP_MS)
    }
  }
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, RETRY_DELAY_CAP_MS)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function ask(batch: Batch, apiKey: string): Promise<unknown> {
  let delay = 0
  let lastError = "network_error"
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (delay > 0) await sleep(delay)
    let response: Response
    try {
      response = await fetch(SETTINGS.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch.body),
        signal: AbortSignal.timeout(SETTINGS.timeoutMs),
      })
    } catch {
      lastError = "network_error"
      delay = Math.min((delay || BACKOFF_BASE_MS) * 2, RETRY_DELAY_CAP_MS)
      continue
    }
    if (response.ok) {
      return await response.json().catch(() => {
        throw new Error("invalid_response")
      })
    }
    lastError = `jev_http_${response.status}`
    const retryable = response.status === 429 || response.status === 529 || response.status >= 500
    await response.body?.cancel()
    if (!retryable) throw new Error(lastError)
    delay = retryDelay(response, attempt)
  }
  throw new Error(lastError)
}

function parseBatch(data: unknown, batch: Batch): { scored: Scored[]; inputTokens: number; model: string } {
  const record = object(data)
  const answers = object(record.answers)
  const usage = object(record.usage)
  if (
    Object.keys(answers).length !== batch.candidates.length ||
    typeof record.model !== "string" ||
    !Number.isSafeInteger(usage.input_tokens) ||
    Number(usage.input_tokens) < 0
  ) {
    throw new Error("invalid_response")
  }
  const scored = batch.candidates.map((candidate, i) => {
    const answer = object(answers[`c_${i}`])
    const score = answer.noul
    if (
      answer.type !== "noul" ||
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    ) {
      throw new Error("invalid_response")
    }
    return { candidate, score }
  })
  return { scored, inputTokens: Number(usage.input_tokens), model: record.model }
}

async function score(batches: Batch[], apiKey: string) {
  const scored: Scored[] = []
  const models = new Set<string>()
  let inputTokens = 0
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(SETTINGS.concurrency, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++]
        const parsed = parseBatch(await ask(batch, apiKey), batch)
        scored.push(...parsed.scored)
        inputTokens += parsed.inputTokens
        models.add(parsed.model)
      }
    }),
  )
  if (models.size > 1) throw new Error("inconsistent_model")
  return { scored, inputTokens, model: [...models][0] ?? SETTINGS.model }
}

async function readCandidates(path: string): Promise<string> {
  if (path === "-") return await new Response(Bun.stdin.stream()).text()
  const file = Bun.file(path)
  if (!(await file.exists())) fail(`candidates file not found: ${path}`)
  return await file.text()
}

function splitCandidates(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "")
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options) {
    console.log(USAGE)
    return
  }
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey?.trim()) fail("missing_api_key")
  const candidates = splitCandidates(await readCandidates(options.candidates))
  if (!candidates.length) fail("candidates are empty")
  const batches = planBatches(options.request, candidates)
  const result = await score(batches, apiKey)
  result.scored.sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
  const output = options.limit ? result.scored.slice(0, options.limit) : result.scored
  for (const item of output) console.log(`${item.score}\t${item.candidate}`)
  console.error(
    `jev: ${candidates.length} candidates, ${batches.length} request(s) in batches of up to ${SETTINGS.batchSize}, model ${result.model}, ${result.inputTokens} input tokens`,
  )
}

function safeReason(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return /^(missing_api_key|task_too_large|invalid_response|inconsistent_model|network_error|jev_http_\d{3}|candidates are empty)$/.test(
    message,
  )
    ? message
    : "jev_failed"
}

main().catch((error: unknown) => fail(safeReason(error)))
