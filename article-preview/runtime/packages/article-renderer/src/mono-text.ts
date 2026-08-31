import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * Collects the characters a rendered article draws in `--font-mono`.
 *
 * Only these characters need the embedded Moralerspace subset: the body face is
 * `--font-sans`, which resolves to the reader's own UI gothic and ships no
 * bytes. Collecting the whole document instead would embed every prose glyph in
 * a face that never draws it.
 *
 * Two shapes carry that text, and neither can be read from the source string:
 *
 *   - `pre` and `code` elements. This covers fenced blocks, inline code, and the
 *     Mermaid source, which stays in the tree as a `language-mermaid` code
 *     element before the diagram transform and as `.mermaid-raw` after it. A
 *     diagram's labels are therefore collected with its source, which is what
 *     the build-time width measurement needs.
 *   - `data-labels` on a code group. Its tabs are built in the browser from that
 *     JSON, so the labels are never text in the tree, and they are drawn in
 *     `--font-mono` by `.code-group-tabs`.
 *
 * The remaining monospace text is generated rather than authored - the section
 * counter's digits and a code block's language name - and printable ASCII, which
 * the subset always covers, is enough for it.
 *
 * Call this before the Mermaid transform: the display font and the font the
 * headless browser measures against are built from one return value, so they
 * cannot disagree about which glyphs exist.
 */
export function collectMonoText(tree: Root): string {
  const parts: string[] = [];

  const pushText = (node: ElementContent): void => {
    if (node.type === "text") {
      parts.push(node.value);
      return;
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children as ElementContent[]) {
        pushText(child);
      }
    }
  };

  visit(tree, "element", (node: Element) => {
    if (node.tagName === "pre" || node.tagName === "code") {
      for (const child of node.children) {
        pushText(child);
      }
    }
    const labels = node.properties?.["data-labels"];
    if (typeof labels === "string") {
      parts.push(labels);
    }
  });

  return parts.join("");
}
