/**
 * Mermaid frontmatter handling.
 *
 * Mermaid sources may start with a YAML frontmatter block. A top-level `title`
 * key is used as the diagram label in the block header, and is removed from the
 * source handed to the renderer so the title is not drawn inside the SVG.
 */

const FRONTMATTER_OPEN_RE = /^[ \t]*---[ \t]*(\r\n|\n)/;
const FRONTMATTER_CLOSE_RE = /\r?\n---[ \t]*(?:\r?\n|$)/g;
const TOP_LEVEL_TITLE_RE = /^title[ \t]*:[ \t]*(.*)$/;

interface FrontmatterBlock {
  opening: string;
  inner: string;
  separator: string;
  closing: string;
  rest: string;
  lineEnding: string;
}

interface FrontmatterTitle {
  index: number;
  value: string;
}

function unquote(value: string): string {
  const match = value.match(/^(['"])(.*)\1$/);
  return match ? match[2] : value;
}

function readFrontmatter(source: string): FrontmatterBlock | undefined {
  const opening = source.match(FRONTMATTER_OPEN_RE);
  if (!opening) {
    return undefined;
  }
  const contentStart = opening[0].length;
  FRONTMATTER_CLOSE_RE.lastIndex = contentStart;
  const closing = FRONTMATTER_CLOSE_RE.exec(source);
  if (!closing) {
    return undefined;
  }
  const separator = closing[0].startsWith("\r\n") ? "\r\n" : "\n";
  const closingStart = closing.index + separator.length;
  const closingEnd = closing.index + closing[0].length;
  return {
    opening: opening[0],
    inner: source.slice(contentStart, closing.index),
    separator,
    closing: source.slice(closingStart, closingEnd),
    rest: source.slice(closingEnd),
    lineEnding: opening[1],
  };
}

function splitFrontmatterLines(inner: string): string[] {
  return inner.length > 0 ? inner.split(/\r\n|\n/) : [];
}

function findTopLevelTitle(lines: string[]): FrontmatterTitle | undefined {
  for (const [index, line] of lines.entries()) {
    const title = line.match(TOP_LEVEL_TITLE_RE);
    if (!title) {
      continue;
    }
    return { index, value: unquote(title[1].trim()) };
  }
  return undefined;
}

export function extractTitle(source: string): string | undefined {
  const frontmatter = readFrontmatter(source);
  if (!frontmatter) {
    return undefined;
  }
  const title = findTopLevelTitle(splitFrontmatterLines(frontmatter.inner));
  if (!title) {
    return undefined;
  }
  return title.value.length > 0 ? title.value : undefined;
}

export function stripFrontmatterTitle(source: string): string {
  const frontmatter = readFrontmatter(source);
  if (!frontmatter) {
    return source;
  }
  const lines = splitFrontmatterLines(frontmatter.inner);
  const title = findTopLevelTitle(lines);
  if (!title) {
    return source;
  }
  lines.splice(title.index, 1);
  const remaining = lines.join(frontmatter.lineEnding);
  if (remaining.trim().length === 0) {
    return frontmatter.rest;
  }
  return `${frontmatter.opening}${remaining}${frontmatter.separator}${frontmatter.closing}${frontmatter.rest}`;
}
