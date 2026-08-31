import type { Root, RootContent } from "mdast";

// Reading speed assumptions: CJK prose is read per character, Latin prose per word.
const CJK_CHARS_PER_MINUTE = 500;
const LATIN_WORDS_PER_MINUTE = 200;
const CJK_CHAR_RE = /[㐀-鿿豈-﫿぀-ゟ゠-ヿ]/g;
const LATIN_WORD_RE = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;
// Code is skimmed rather than read, and frontmatter/raw HTML are not prose.
const SKIP_TYPES = new Set([
  "code",
  "yaml",
  "html",
  "mdxjsEsm",
  "mdxFlowExpression",
  "mdxTextExpression",
]);

function collectText(node: Root | RootContent, out: string[]): void {
  if (SKIP_TYPES.has(node.type)) {
    return;
  }
  if ("value" in node && typeof node.value === "string") {
    out.push(node.value);
    return;
  }
  if ("children" in node) {
    for (const child of node.children as RootContent[]) {
      collectText(child, out);
    }
  }
}

/** Estimated reading time in whole minutes, at least 1, from the prose of an mdast tree. */
export function estimateReadingMinutes(tree: Root): number {
  const parts: string[] = [];
  collectText(tree, parts);
  const text = parts.join(" ");
  const cjkChars = text.match(CJK_CHAR_RE)?.length ?? 0;
  const latinWords = text.replace(CJK_CHAR_RE, " ").match(LATIN_WORD_RE)?.length ?? 0;
  const minutes = cjkChars / CJK_CHARS_PER_MINUTE + latinWords / LATIN_WORDS_PER_MINUTE;
  return Math.max(1, Math.ceil(minutes));
}

interface AstroData {
  astro: { frontmatter: Record<string, unknown> };
}

/** remark plugin exposing `readingMinutes` through Astro's remarkPluginFrontmatter. */
export function remarkReadingTime() {
  return (tree: Root, file: { data: Record<string, unknown> }): void => {
    const data = file.data as unknown as AstroData;
    data.astro ??= { frontmatter: {} };
    data.astro.frontmatter ??= {};
    data.astro.frontmatter.readingMinutes = estimateReadingMinutes(tree);
  };
}
