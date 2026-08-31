/**
 * Japanese phrase-aware line breaking for short display strings (card titles,
 * hero headings). BudouX segments the text at phrase boundaries and the joined
 * result carries zero-width spaces at those boundaries only.
 *
 * Zero-width spaces are break *opportunities*, not hard breaks: the same string
 * renders at several widths (three card layouts, the article hero, the OG
 * image), and each picks its own break points. Elements styled this way must
 * also set `word-break: keep-all` so the browser stops breaking anywhere, with
 * `overflow-wrap: anywhere` as the fallback for a phrase wider than its box.
 *
 * Runs at build time only. The unsegmented string stays the source of truth for
 * <title>, RSS and OG rendering.
 */
import { loadDefaultJapaneseParser } from "budoux";

const parser = loadDefaultJapaneseParser();

const ZERO_WIDTH_SPACE = "\u200b";

/**
 * Idempotent: markers left by an earlier call are dropped before re-segmenting,
 * so a string that passes through twice carries one marker per boundary.
 */
export function phraseWrap(text: string): string {
  return parser.parse(text.replaceAll(ZERO_WIDTH_SPACE, "")).join(ZERO_WIDTH_SPACE);
}
