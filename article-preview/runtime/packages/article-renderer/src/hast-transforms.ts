import type { Element, ElementContent, Parent, Root, RootContent } from "hast";
import { copyIcon, headingLinkIcon, wrapToggleIcon } from "./icons.js";
import { phraseWrap } from "./phrase-wrap.js";

const COLLAPSE_THRESHOLD = 15;

export interface CodeBlockTransformOptions {
  copyIcon: () => Element;
  wrapToggleIcon: () => Element;
}

export interface HeadingLinkTransformOptions {
  headingLinkIcon: () => Element;
}

function countLines(text: string): number {
  const trimmed = text.replace(/\n$/, "");
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split("\n").length;
}

function getLanguage(pre: Element): string | undefined {
  const data = pre.properties?.dataLanguage;
  if (typeof data === "string" && data.length > 0) {
    return data;
  }
  const code = pre.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  );
  if (!code) {
    return undefined;
  }
  const className = code.properties?.className;
  if (Array.isArray(className)) {
    for (const cls of className) {
      if (typeof cls === "string" && cls.startsWith("language-")) {
        return cls.slice("language-".length);
      }
    }
  }
  return undefined;
}

function extractText(node: ElementContent | RootContent): string {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "element") {
    return node.children.map(extractText).join("");
  }
  return "";
}

function buildCodeHeader(
  language: string | undefined,
  source: string,
  options: CodeBlockTransformOptions,
): Element {
  const children: ElementContent[] = [];
  if (language) {
    children.push({
      type: "element",
      tagName: "span",
      properties: { className: ["code-lang"] },
      children: [{ type: "text", value: language }],
    });
  } else {
    children.push({
      type: "element",
      tagName: "span",
      properties: { className: ["code-lang", "code-lang-empty"] },
      children: [],
    });
  }
  const copyButton: Element = {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["code-copy"],
      "aria-label": "Copy code",
      "data-source": source,
    },
    children: [options.copyIcon()],
  };
  const wrapToggle: Element = {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["code-wrap-toggle"],
      "aria-label": "Toggle word wrap",
    },
    children: [options.wrapToggleIcon()],
  };
  children.push({
    type: "element",
    tagName: "div",
    properties: { className: ["code-block-actions"] },
    children: [copyButton, wrapToggle],
  });
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["code-block-header"] },
    children,
  };
}

function buildCollapseToggle(): Element {
  return {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["code-collapse-toggle"],
      "aria-label": "Toggle code collapse",
    },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { className: ["collapse-label-expand"] },
        children: [{ type: "text", value: "∨ 展開する" }],
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["collapse-label-fold"] },
        children: [{ type: "text", value: "∧ 折りたたむ" }],
      },
    ],
  };
}

function wrapCodeBlock(
  pre: Element,
  language: string | undefined,
  options: CodeBlockTransformOptions,
): Element {
  const source = extractText(pre);
  const collapsible = countLines(source) >= COLLAPSE_THRESHOLD;
  const children: ElementContent[] = [buildCodeHeader(language, source, options), pre];
  if (collapsible) {
    children.push(buildCollapseToggle());
  }
  return {
    type: "element",
    tagName: "div",
    properties: {
      className: ["code-block-wrapper"],
      "data-language": language ?? "",
      ...(collapsible && { "data-collapsible": "" }),
    },
    children,
  };
}

function isManagedCodeWrapper(node: Element): boolean {
  if (node.tagName !== "div") {
    return false;
  }
  const className = node.properties?.className;
  return (
    Array.isArray(className) &&
    (className.includes("code-block-wrapper") ||
      className.includes("mermaid-block-wrapper") ||
      className.includes("code-group"))
  );
}

function transformCodeBlockChildren(parent: Parent, options: CodeBlockTransformOptions): void {
  const next: typeof parent.children = [];
  for (const child of parent.children) {
    if (child.type === "element") {
      if (child.tagName === "pre") {
        const language = getLanguage(child);
        if (language === "mermaid") {
          next.push(child);
          continue;
        }
        next.push(wrapCodeBlock(child, language, options));
        continue;
      }
      if (!isManagedCodeWrapper(child)) {
        transformCodeBlockChildren(child, options);
      }
    }
    next.push(child);
  }
  parent.children = next;
}

export function createRehypeCodeBlock(options: CodeBlockTransformOptions) {
  return () =>
    (tree: Root): void => {
      transformCodeBlockChildren(tree, options);
    };
}

export const rehypeCodeBlock = createRehypeCodeBlock({ copyIcon, wrapToggleIcon });

function hasTableWrapClass(node: Element): boolean {
  const className = node.properties?.className;
  if (Array.isArray(className)) {
    return className.includes("table-wrap");
  }
  if (typeof className === "string") {
    return className.split(/\s+/).includes("table-wrap");
  }
  return false;
}

function transformTableChildren(parent: Parent): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child?.type !== "element") {
      continue;
    }
    if (child.tagName === "table") {
      if (parent.type === "element" && parent.tagName === "div" && hasTableWrapClass(parent)) {
        continue;
      }
      const wrapped: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["table-wrap"] },
        children: [child],
      };
      parent.children[index] = wrapped;
      continue;
    }
    transformTableChildren(child);
  }
}

export function rehypeTableWrap() {
  return (tree: Root): void => {
    transformTableChildren(tree);
  };
}

function buildHeadingLinkButton(options: HeadingLinkTransformOptions): Element {
  const icon = options.headingLinkIcon();
  icon.properties = { ...icon.properties, className: ["heading-link-icon"] };
  return {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["heading-link"],
      "aria-label": "Copy link to section",
    },
    children: [icon],
  };
}

function transformHeadingChildren(parent: Parent, options: HeadingLinkTransformOptions): void {
  for (const child of parent.children) {
    if (child.type !== "element") {
      continue;
    }
    if (child.tagName === "h2") {
      child.children.unshift(buildHeadingLinkButton(options));
      continue;
    }
    transformHeadingChildren(child, options);
  }
}

function phraseWrapTextNodes(parent: Parent): void {
  for (const child of parent.children) {
    if (child.type === "text") {
      child.value = phraseWrap(child.value);
      continue;
    }
    if (child.type === "element" && child.tagName !== "code") {
      phraseWrapTextNodes(child);
    }
  }
}

function transformHeadingWrapPoints(parent: Parent): void {
  for (const child of parent.children) {
    if (child.type !== "element") {
      continue;
    }
    if (child.tagName === "h2") {
      phraseWrapTextNodes(child);
      continue;
    }
    transformHeadingWrapPoints(child);
  }
}

/**
 * Mark phrase boundaries in h2 text with zero-width spaces so a heading that
 * does not fit breaks between phrases instead of mid-word. Inline code keeps
 * its text untouched. The CSS side must pair this with `word-break: keep-all`.
 */
export function rehypeHeadingPhraseWrap() {
  return (tree: Root): void => {
    transformHeadingWrapPoints(tree);
  };
}

export function createRehypeHeadingLink(options: HeadingLinkTransformOptions) {
  return () =>
    (tree: Root): void => {
      transformHeadingChildren(tree, options);
    };
}

export const rehypeHeadingLink = createRehypeHeadingLink({ headingLinkIcon });

export function rehypeStripH1() {
  return (tree: Root): void => {
    const index = tree.children.findIndex(
      (node) => node.type === "element" && (node as Element).tagName === "h1",
    );
    if (index !== -1) {
      tree.children.splice(index, 1);
    }
  };
}
