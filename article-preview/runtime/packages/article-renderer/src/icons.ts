import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Element } from "hast";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";

const iconsDir = fileURLToPath(new URL("./assets/icons", import.meta.url));

const iconCache = new Map<string, Element>();

/**
 * Drop the indentation between an SVG's tags. These text nodes are invisible
 * when rendered, but an icon inlined into a heading becomes part of that
 * heading's text content, and the heading id is derived from it: the four
 * leading hyphens once seen on every h2 anchor were this whitespace.
 */
function stripFormattingWhitespace(node: Element): void {
  node.children = node.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === ""),
  );
  for (const child of node.children) {
    if (child.type === "element") {
      stripFormattingWhitespace(child);
    }
  }
}

function loadIcon(name: string): Element {
  const cached = iconCache.get(name);
  if (cached) return cached;
  const svg = readFileSync(`${iconsDir}/${name}.svg`, "utf-8");
  const tree = fromHtmlIsomorphic(svg, { fragment: true });
  const el = tree.children.find((c): c is Element => c.type === "element" && c.tagName === "svg");
  if (!el) throw new Error(`Invalid icon: ${name}`);
  stripFormattingWhitespace(el);
  iconCache.set(name, el);
  return el;
}

/** Inject a CSS class into an SVG string by adding it to the root `<svg` tag. */
export function withSvgClass(svgString: string, className: string): string {
  return svgString.replace("<svg ", `<svg class="${className}" `);
}

/** Read an SVG file and return its content as an HTML string. */
function loadIconString(name: string): string {
  return readFileSync(`${iconsDir}/${name}.svg`, "utf-8").trim();
}

// --- hast Element icons (cloned per call to avoid shared-mutation) ---

export const copyIcon = (): Element => structuredClone(loadIcon("copy"));
export const wrapToggleIcon = (): Element => structuredClone(loadIcon("wrap-toggle"));
export const viewToggleIcon = (): Element => structuredClone(loadIcon("view-toggle"));
export const headingLinkIcon = (): Element => structuredClone(loadIcon("heading-link"));
export const noteIcon = (): Element => structuredClone(loadIcon("note"));
export const warningIcon = (): Element => structuredClone(loadIcon("warning"));
export const cautionIcon = (): Element => structuredClone(loadIcon("caution"));

// --- HTML string icons (immutable strings, no cloning needed) ---

export const calendarIconString = loadIconString("calendar");
export const clockIconString = loadIconString("clock");
export const bookOpenIconString = loadIconString("book-open");
export const tagIconString = loadIconString("tag");
export const themeIconString = loadIconString("theme");
