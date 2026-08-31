import type { Element, ElementContent, Root } from "hast";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { visit } from "unist-util-visit";
import { copyIcon, viewToggleIcon } from "../icons.js";
import { extractTitle } from "./mermaid-frontmatter.js";

/**
 * Builders for the Mermaid diagram wrapper element: header with copy and
 * raw-source toggle buttons, the prerendered SVG preview, and the hidden raw
 * source block.
 */

function buildHeader(
  label: string,
  source: string,
  ids: { previewId: string; rawId: string },
  pngUri?: string,
): Element {
  const copyButton: Element = {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["code-copy"],
      "aria-label": "Copy diagram",
      "data-source": source,
      ...(pngUri && { "data-png": pngUri }),
    },
    children: [copyIcon()],
  };
  const viewToggle: Element = {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["mermaid-view-toggle"],
      "aria-label": "Toggle raw source",
      "aria-controls": `${ids.previewId} ${ids.rawId}`,
      "aria-pressed": "false",
    },
    children: [viewToggleIcon()],
  };
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["code-block-header"] },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { className: ["code-lang"] },
        children: [{ type: "text", value: label }],
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["code-block-actions"] },
        children: [copyButton, viewToggle],
      },
    ],
  };
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Mermaid emits empty/colon-less `style` attributes (e.g. `style=""`,
 * `style=";"`). They carry no styling, but MDX reprocesses the inline SVG into
 * JSX and its strict CSS parser rejects them. Drop any style without a colon.
 */
function sanitizeSvgStyles(root: Root): void {
  visit(root, "element", (node) => {
    const style = node.properties?.style;
    if (typeof style === "string" && !style.includes(":")) {
      delete node.properties.style;
    }
  });
}

function parseSvg(svg: string): ElementContent[] {
  const root = fromHtmlIsomorphic(svg, { fragment: true });
  sanitizeSvgStyles(root);
  return root.children as ElementContent[];
}

function buildPreviewChildren(svg: string | null, fallbackSource: string): ElementContent[] {
  if (svg == null) {
    return [{ type: "text", value: fallbackSource }];
  }
  return parseSvg(svg);
}

export function buildMermaidElement(
  trimmed: string,
  renderSource: string,
  index: number,
  svg: string | null,
  pngUri?: string,
): Element {
  const suffix = `${index}-${hashString(trimmed)}`;
  const ids = {
    previewId: `mermaid-preview-${suffix}`,
    rawId: `mermaid-raw-${suffix}`,
  };
  const label = extractTitle(trimmed) ?? "MERMAID";
  const preview: Element = {
    type: "element",
    tagName: "div",
    properties: {
      id: ids.previewId,
      className: ["mermaid"],
      "aria-hidden": "false",
    },
    children: buildPreviewChildren(svg, renderSource),
  };
  const raw: Element = {
    type: "element",
    tagName: "pre",
    properties: {
      id: ids.rawId,
      className: ["mermaid-raw"],
      hidden: true,
      "aria-hidden": "true",
    },
    children: [
      {
        type: "element",
        tagName: "code",
        properties: {},
        children: [{ type: "text", value: trimmed }],
      },
    ],
  };
  const body: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["mermaid-body"] },
    children: [preview, raw],
  };
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["mermaid-block-wrapper"] },
    children: [buildHeader(label, trimmed, ids, pngUri), body],
  };
}
