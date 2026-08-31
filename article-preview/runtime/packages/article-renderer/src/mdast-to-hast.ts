import type {
  Element as HastElement,
  ElementContent as HastElementContent,
  Node as HastNode,
  Root as HastRoot,
  Text as HastText,
} from "hast";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import type { Root, RootContent } from "mdast";
import { toHast } from "mdast-util-to-hast";
import { extractHeadingText } from "./heading-slug.js";
import {
  convertCallout,
  convertCodeGroup,
  convertImage,
  convertVideo,
  type JsxNode,
} from "./mdx-node-converters.js";
import { buildImage, EAGER_IMAGE_COUNT } from "./media.js";

import type { Highlighter, RenderContext } from "./render-context.js";

export function convertChildren(children: RootContent[], ctx: RenderContext): HastNode[] {
  const nodes: HastNode[] = [];
  for (const node of children) {
    const converted = convertNode(node, ctx);
    if (converted !== null) {
      nodes.push(converted);
    }
  }
  return nodes;
}

function getNodeChildren(node: RootContent): RootContent[] {
  if ("children" in node && Array.isArray(node.children)) {
    return node.children as RootContent[];
  }
  return [];
}

function convertCode(node: RootContent & { type: "code" }, highlighter: Highlighter): HastNode {
  const language = node.lang ?? "text";
  let highlighted: string;
  try {
    highlighted = highlighter.codeToHtml(node.value, { lang: language, theme: "tui-console" });
  } catch {
    highlighted = highlighter.codeToHtml(node.value, { lang: "text", theme: "tui-console" });
  }

  const root = fromHtmlIsomorphic(highlighted, { fragment: true });
  const pre = root.children.find(
    (child): child is HastElement => child.type === "element" && child.tagName === "pre",
  );
  if (!pre) {
    throw new Error("Shiki output did not contain a pre element");
  }
  if (node.lang) {
    pre.properties = { ...pre.properties, dataLanguage: node.lang };
  }
  return pre;
}

export function convertNode(node: RootContent, ctx: RenderContext): HastNode | null {
  const { slugger, headings, diagnostics, highlighter } = ctx;

  for (const transformer of ctx.transformers) {
    const result = transformer(node, ctx);
    if (result !== undefined) {
      return result;
    }
  }

  if (node.type === "mdxjsEsm") {
    diagnostics.push({
      level: "info",
      message: `Removed esm node (import/export): ${node.value.slice(0, 60)}`,
      node: "mdxjsEsm",
    });
    return null;
  }

  if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
    throw new Error(
      `No builder for the JavaScript expression {${node.value}}. Validate the source before rendering it.`,
    );
  }

  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const name = node.name ?? "(anonymous)";

    if (name === "Callout") {
      return convertCallout(node as unknown as JsxNode, ctx);
    }

    if (name === "CodeGroup") {
      return convertCodeGroup(node as unknown as JsxNode, ctx);
    }

    if (name === "Image") {
      return convertImage(node as unknown as JsxNode, ctx);
    }

    if (name === "Video") {
      return convertVideo(node as unknown as JsxNode);
    }

    throw new Error(
      `No builder for MDX component: <${name}>. Validate the source before rendering it.`,
    );
  }

  if (node.type === "heading") {
    const rawChildren = toHast({ type: "root", children: [node] } as Root) as HastRoot;
    const headingHast = rawChildren.children[0] as HastElement;
    const textContent = extractHeadingText(headingHast);
    const slug = slugger.slug(textContent);

    headings.push({ depth: node.depth, text: textContent, slug });

    const children = ctx.convertChildren(getNodeChildren(node));

    return {
      type: "element",
      tagName: `h${node.depth}`,
      properties: { id: slug },
      children,
    } as HastElement;
  }

  if (node.type === "code") {
    return convertCode(node, highlighter);
  }

  if (node.type === "image") {
    // `![alt](src)` is the degraded form of <Image>: the web forbids it, and the
    // CLI accepts it because the documents it opens are not all written for this
    // site. It reaches the same builder so both forms draw the same figure.
    return buildImage(
      { src: node.url, alt: node.alt ?? "", ratio: null, caption: null, loop: false },
      { eager: ctx.nextImageIndex() < EAGER_IMAGE_COUNT },
    );
  }

  if (node.type === "table") {
    // Use mdast-util-to-hast's full table conversion (preserves thead/th/align);
    // recursing per-cell would lose the header structure. Then wrap for scroll.
    const tableHast = toHast({ type: "root", children: [node] } as Root) as HastRoot;
    const tableEl = tableHast.children[0];
    if (!tableEl) {
      return null;
    }
    return tableEl as HastNode;
  }

  if (node.type === "list") {
    const isTight = node.spread === false;
    const listHast = toHast({ type: "root", children: [node] } as Root) as HastRoot;
    const listEl = listHast.children[0] as HastElement;
    if (listEl?.type !== "element") {
      return listEl ?? null;
    }

    const convertedItems = (node.children as RootContent[]).map((item) => {
      const itemHast = toHast({ type: "root", children: [item] } as Root) as HastRoot;
      const itemEl = itemHast.children[0] as HastElement;
      if (itemEl?.type !== "element") {
        return itemEl ?? null;
      }

      if (isTight) {
        // Tight list item: no <p> wrapper. Inline a paragraph child's children so
        // custom inline transforms (<code>, <strong>, etc.) still apply, but keep
        // any other block child (e.g. a nested list) converted as its own node.
        const itemChildren = (getNodeChildren(item as RootContent) as RootContent[]).flatMap(
          (child) => {
            if (child.type === "paragraph") {
              return ctx.convertChildren(getNodeChildren(child));
            }
            const converted = convertNode(child, ctx);
            return converted ? [converted] : [];
          },
        );
        return { ...itemEl, children: itemChildren.length > 0 ? itemChildren : itemEl.children };
      }

      // Loose list item: preserve <p> wrapper via convertChildren.
      const children = ctx.convertChildren(getNodeChildren(item as RootContent));
      return { ...itemEl, children: children.length > 0 ? children : itemEl.children };
    });

    const itemNodes = convertedItems.filter((n): n is HastElement => n !== null);
    return { ...listEl, children: itemNodes as HastElementContent[] };
  }

  if (
    node.type === "paragraph" ||
    node.type === "blockquote" ||
    node.type === "listItem" ||
    node.type === "tableRow" ||
    node.type === "tableCell" ||
    node.type === "strong" ||
    node.type === "emphasis" ||
    node.type === "link" ||
    node.type === "inlineCode" ||
    node.type === "thematicBreak"
  ) {
    const children = ctx.convertChildren(getNodeChildren(node));

    const simpleHast = toHast({ type: "root", children: [node] } as Root) as HastRoot;
    const simpleEl = simpleHast.children[0] as HastElement;

    if (simpleEl && simpleEl.type === "element") {
      return { ...simpleEl, children: children.length > 0 ? children : simpleEl.children };
    }
    return simpleEl ?? null;
  }

  if (node.type === "text") {
    return { type: "text", value: (node as { value: string }).value } as HastText;
  }

  const fallbackHast = toHast({ type: "root", children: [node] } as Root) as HastRoot;
  return (fallbackHast.children[0] as HastNode | undefined) ?? null;
}
