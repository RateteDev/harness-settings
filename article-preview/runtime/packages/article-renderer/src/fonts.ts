import { readFileSync } from "node:fs";
import subsetFont from "subset-font";

/**
 * Builds embeddable Moralerspace `@font-face` rules subset to the characters a
 * document actually draws in it, for fully self-contained standalone HTML.
 *
 * The font bytes are sourced from this package's own vendor copy
 * (`vendor/fonts/`) so sub-apps never reference the web app. The subset covers
 * printable ASCII plus every codepoint in the given text.
 *
 * Pass the monospace text alone, from `collectMonoText`, not the document
 * source: Moralerspace is the `--font-mono` face and never draws body prose, so
 * a document's own codepoints would embed hundreds of glyphs nothing renders.
 * Both entry points here must be given the same text, or the page and the
 * build-time Mermaid measurement disagree about which glyphs exist.
 */

const FACES = [
  { src: "MoralerspaceNeon-Regular.woff2", weight: "400" },
  { src: "MoralerspaceNeon-Bold.woff2", weight: "600 700" },
];

function collectCharset(text: string): string {
  const set = new Set<string>();
  for (let code = 0x20; code <= 0x7e; code += 1) {
    set.add(String.fromCodePoint(code));
  }
  for (const ch of text) {
    set.add(ch);
  }
  return [...set].join("");
}

const rulesCache = new Map<string, Promise<string>>();

function subsetFaces(charset: string): Promise<string> {
  const cached = rulesCache.get(charset);
  if (cached) {
    return cached;
  }
  const pending = (async () => {
    const rules = await Promise.all(
      FACES.map(async ({ src, weight }) => {
        const full = readFileSync(new URL(`../vendor/fonts/${src}`, import.meta.url));
        const subset = await subsetFont(full, charset, { targetFormat: "woff2" });
        const data = `data:font/woff2;base64,${subset.toString("base64")}`;
        return `@font-face{font-family:'Moralerspace';src:url('${data}') format('woff2');font-weight:${weight};font-style:normal;font-display:swap}`;
      }),
    );
    return rules.join("");
  })();
  rulesCache.set(charset, pending);
  return pending;
}

/** `@font-face` rules string for embedding in a page `<style>`. */
export function buildFontFaceCss(text: string): Promise<string> {
  return subsetFaces(collectCharset(text));
}

/**
 * Same rules wrapped as a `data:text/css` URL, for the Mermaid renderer's `css`
 * option so the headless browser measures text with the display font.
 */
export async function buildFontCssDataUrl(text: string): Promise<string> {
  const rules = await subsetFaces(collectCharset(text));
  return `data:text/css;base64,${Buffer.from(rules).toString("base64")}`;
}
