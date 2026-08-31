import type { Root } from "mdast";
import type { MdxJsxAttributeLike } from "../../mdx-components.js";
import {
  BOOLEAN_MEDIA_ATTRIBUTES,
  IMAGE_ATTRIBUTES,
  isVideoReference,
  normalizeRatio,
  VIDEO_ATTRIBUTES,
} from "../../media.js";
import { createSharedIssue, type ValidationIssue } from "../types.js";
import { isJsx, positionOf, type UnistLike, walk } from "../walk.js";

/**
 * What <Image> and <Video> must satisfy for either renderer to draw them.
 *
 * What a renderer additionally requires of the articles it publishes — that a
 * picture carry alternative text, say — is that renderer's own rule and is not
 * here: the CLI opens documents that were never written for a site.
 */
const ATTRIBUTES_BY_COMPONENT: Record<string, readonly string[]> = {
  Image: IMAGE_ATTRIBUTES,
  Video: VIDEO_ATTRIBUTES,
};

/** Attributes written bare, without a value. */
const BARE_ATTRIBUTES = new Set<string>(BOOLEAN_MEDIA_ATTRIBUTES);

function attributesOf(node: UnistLike): MdxJsxAttributeLike[] {
  return (node as { attributes?: MdxJsxAttributeLike[] }).attributes ?? [];
}

function checkAttributeShape(
  node: UnistLike,
  component: string,
  allowed: readonly string[],
  issues: ValidationIssue[],
): void {
  for (const attribute of attributesOf(node)) {
    if (attribute.type !== "mdxJsxAttribute" || attribute.name === undefined) {
      issues.push(
        createSharedIssue(
          "MediaUnknownAttribute",
          `<${component}> takes only ${allowed.join(", ")}. A spread attribute would let anything else through, so it is not accepted.`,
          positionOf(node),
          `<${component}>`,
        ),
      );
      continue;
    }

    const name = attribute.name;
    if (!allowed.includes(name)) {
      issues.push(
        createSharedIssue(
          "MediaUnknownAttribute",
          `<${component}> has no "${name}" attribute. It takes only ${allowed.join(", ")}: styling reaches the figure from the article's CSS, never from the article's text.`,
          positionOf(node),
          `<${component} ${name}>`,
        ),
      );
      continue;
    }

    const isBare = attribute.value === null || attribute.value === undefined;
    if (BARE_ATTRIBUTES.has(name) && !isBare) {
      issues.push(
        createSharedIssue(
          "MediaNonLiteralAttribute",
          `The "${name}" attribute of <${component}> takes no value. Write it bare, as ${name}.`,
          positionOf(node),
          `<${component} ${name}>`,
        ),
      );
      continue;
    }
    if (!BARE_ATTRIBUTES.has(name) && typeof attribute.value !== "string") {
      issues.push(
        createSharedIssue(
          "MediaNonLiteralAttribute",
          `The "${name}" attribute of <${component}> is read off the syntax tree, so it must be a plain string. Write ${name}="…".`,
          positionOf(node),
          `<${component} ${name}>`,
        ),
      );
    }
  }
}

/** The value of a string attribute, or null when it is absent or not a string. */
export function mediaAttributeValue(node: UnistLike, name: string): string | null {
  for (const attribute of attributesOf(node)) {
    if (attribute.type === "mdxJsxAttribute" && attribute.name === name) {
      return typeof attribute.value === "string" ? attribute.value : null;
    }
  }
  return null;
}

export function hasMediaAttribute(node: UnistLike, name: string): boolean {
  return attributesOf(node).some(
    (attribute) => attribute.type === "mdxJsxAttribute" && attribute.name === name,
  );
}

/** The names of the media components, for a renderer walking a tree of its own. */
export const MEDIA_COMPONENTS = ["Image", "Video"] as const;

function checkMediaNode(node: UnistLike, component: string, issues: ValidationIssue[]): void {
  checkAttributeShape(node, component, ATTRIBUTES_BY_COMPONENT[component], issues);

  const source = mediaAttributeValue(node, "src");
  if (source === null || source === "") {
    issues.push(
      createSharedIssue(
        "MediaMissingSource",
        `<${component}> needs a src. Write the location of the file as src="…".`,
        positionOf(node),
        `<${component}>`,
      ),
    );
  }

  const ratio = mediaAttributeValue(node, "ratio");
  if (ratio !== null && normalizeRatio(ratio) === null) {
    issues.push(
      createSharedIssue(
        "MediaInvalidRatio",
        `The ratio of <${component}> is written as <width>/<height>, e.g. ratio="16/9". "${ratio}" is not that.`,
        positionOf(node),
        `ratio="${ratio}"`,
      ),
    );
  }
}

export function checkMedia(tree: Root): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  walk(tree as unknown as UnistLike, (node) => {
    for (const component of MEDIA_COMPONENTS) {
      if (isJsx(node, component)) {
        checkMediaNode(node, component, issues);
        return;
      }
    }

    if (node.type !== "image") {
      return;
    }

    const url = (node as { url?: string }).url ?? "";
    if (isVideoReference(url)) {
      issues.push(
        createSharedIssue(
          "MarkdownVideoSource",
          `![](${url}) points at a video. In CommonMark the syntax means an image and nothing else, so reading it as a video would invent a rule that exists only in this implementation. Use <Video src="${url}" />.`,
          positionOf(node),
          `![](${url})`,
        ),
      );
    }
  });

  return issues;
}
