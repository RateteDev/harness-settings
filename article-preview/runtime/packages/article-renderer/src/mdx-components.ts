import type { Element as HastElement, ElementContent as HastElementContent, Root } from "hast";
import { cautionIcon, noteIcon, warningIcon } from "./icons.js";
import { buildImage, buildVideo, EAGER_IMAGE_COUNT, readMediaAttributes } from "./media.js";

/**
 * Every component an article may use. A component only belongs here once both
 * the web renderer and the portable renderer can draw it, so an article never
 * depends on which one is reading it.
 */
export const ALLOWED_MDX_COMPONENTS = ["Callout", "CodeGroup", "Image", "Video"] as const;

/**
 * Shared HTML builders for the whitelisted MDX JSX components
 * (Callout / CodeGroup / Image / Video).
 *
 * This module is the single source of truth for the HTML structure these
 * components produce. Two pipelines consume it:
 * - web: `rehypeMdxComponents` replaces mdxJsx nodes at the hast stage
 *   (children are already converted hast) and throws on invalid usage.
 * - CLI: the mdast walker in render-article.ts extracts attributes, converts
 *   children itself, then calls the same builders; errors become diagnostics.
 */

/** Attribute shape shared by mdast- and hast-stage mdxJsx nodes. */
export interface MdxJsxAttributeLike {
  type: string;
  name?: string;
  value?: unknown;
}

export interface MdxJsxNodeLike {
  type: string;
  name: string | null;
  attributes?: MdxJsxAttributeLike[];
  children?: unknown[];
}

function findStringAttribute(
  attributes: MdxJsxAttributeLike[] | undefined,
  name: string,
): string | null {
  for (const attr of attributes ?? []) {
    if (attr.type === "mdxJsxAttribute" && attr.name === name && typeof attr.value === "string") {
      return attr.value;
    }
  }
  return null;
}

// --- Callout ---

const CALLOUT_LABEL_DEFAULTS: Record<string, string> = {
  note: "NOTE",
  warning: "WARNING",
  caution: "CAUTION",
};

const CALLOUT_ICONS: Record<string, () => HastElement> = {
  note: noteIcon,
  warning: warningIcon,
  caution: cautionIcon,
};

export interface CalloutOptions {
  type: string;
  labelText: string;
}

export function extractCalloutOptions(
  attributes: MdxJsxAttributeLike[] | undefined,
): CalloutOptions {
  const type = findStringAttribute(attributes, "type") ?? "note";
  const labelText =
    findStringAttribute(attributes, "label") ?? CALLOUT_LABEL_DEFAULTS[type] ?? "NOTE";
  return { type, labelText };
}

function calloutIconElement(type: string): HastElement {
  const factory = CALLOUT_ICONS[type] ?? (CALLOUT_ICONS.note as () => HastElement);
  const icon = factory();
  icon.properties = { ...icon.properties, className: ["callout-icon"] };
  return icon;
}

export function buildCallout(options: CalloutOptions, children: HastElementContent[]): HastElement {
  return {
    type: "element",
    tagName: "div",
    properties: { class: `callout ${options.type}` },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { class: "callout-label" },
        children: [calloutIconElement(options.type), { type: "text", value: options.labelText }],
      },
      {
        type: "element",
        tagName: "div",
        properties: { class: "callout-body" },
        children,
      },
    ],
  };
}

// --- CodeGroup ---

export const CODE_GROUP_LABELS_ERROR = `<CodeGroup> requires a "labels" attribute as a string-array literal, e.g. labels={["npm", "yarn"]}`;

/**
 * Extracts the `labels` attribute of a CodeGroup as a string array.
 * Returns null when the attribute is missing or is not a string-array literal.
 */
export function extractCodeGroupLabels(
  attributes: MdxJsxAttributeLike[] | undefined,
): string[] | null {
  const labelsAttr = (attributes ?? []).find(
    (attr) => attr.type === "mdxJsxAttribute" && attr.name === "labels",
  );
  const value = labelsAttr?.value;
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const expression = value as { type?: string; data?: { estree?: { body?: unknown[] } } };
  if (expression.type !== "mdxJsxAttributeValueExpression") {
    return null;
  }
  const body = expression.data?.estree?.body;
  if (!Array.isArray(body) || body.length !== 1) {
    return null;
  }
  const statement = body[0] as { type?: string; expression?: unknown };
  if (statement?.type !== "ExpressionStatement") {
    return null;
  }
  const array = statement.expression as { type?: string; elements?: unknown[] };
  if (array?.type !== "ArrayExpression" || !Array.isArray(array.elements)) {
    return null;
  }
  const labels: string[] = [];
  for (const element of array.elements) {
    const literal = element as { type?: string; value?: unknown };
    if (literal?.type !== "Literal" || typeof literal.value !== "string") {
      return null;
    }
    labels.push(literal.value);
  }
  return labels;
}

export function buildCodeGroup(labels: string[], children: HastElementContent[]): HastElement {
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["code-group"], "data-labels": JSON.stringify(labels) },
    children,
  };
}

// --- rehype plugin (hast pipelines; children already converted) ---

interface HastParentLike {
  children?: unknown[];
}

function convertHastMdxNode(node: MdxJsxNodeLike, imageIndex: () => number): HastElement {
  const children = (node.children ?? []) as HastElementContent[];

  if (node.name === "Callout") {
    return buildCallout(extractCalloutOptions(node.attributes), children);
  }
  if (node.name === "CodeGroup") {
    const labels = extractCodeGroupLabels(node.attributes);
    if (labels === null) {
      throw new Error(CODE_GROUP_LABELS_ERROR);
    }
    return buildCodeGroup(labels, children);
  }
  if (node.name === "Image") {
    return buildImage(readMediaAttributes(node.attributes), {
      eager: imageIndex() < EAGER_IMAGE_COUNT,
    });
  }
  if (node.name === "Video") {
    return buildVideo(readMediaAttributes(node.attributes));
  }
  throw new Error(`No builder for MDX component: <${node.name}>`);
}

const BUILDABLE_NAMES = new Set<string>(ALLOWED_MDX_COMPONENTS);

function transformChildren(parent: HastParentLike, imageIndex: () => number): void {
  const children = parent.children;
  if (!children) {
    return;
  }
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index] as MdxJsxNodeLike;
    // Depth-first so nested components are built before their parent.
    transformChildren(child as HastParentLike, imageIndex);
    const isJsx = child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement";
    if (isJsx && child.name !== null && BUILDABLE_NAMES.has(child.name)) {
      children[index] = convertHastMdxNode(child, imageIndex);
    }
  }
}

/**
 * Replaces whitelisted MDX JSX nodes with their static HTML structure.
 * Register LAST in the pipeline so earlier plugins see the same tree shape
 * as before this plugin existed. Throws on invalid usage (build error).
 */
export function rehypeMdxComponents() {
  return (tree: Root): void => {
    // Counted per document, in document order, so that "the first images of the
    // article" means the same thing however many times the plugin is reused.
    let seenImages = 0;
    transformChildren(tree as unknown as HastParentLike, () => seenImages++);
  };
}
