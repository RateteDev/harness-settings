import type { Element as HastElement, ElementContent as HastElementContent } from "hast";
import type { RootContent } from "mdast";
import {
  buildCallout,
  buildCodeGroup,
  CODE_GROUP_LABELS_ERROR,
  extractCalloutOptions,
  extractCodeGroupLabels,
  type MdxJsxAttributeLike,
} from "./mdx-components.js";
import { buildImage, buildVideo, EAGER_IMAGE_COUNT, readMediaAttributes } from "./media.js";
import type { RenderContext } from "./render-context.js";

export interface JsxNode {
  name: string | null;
  attributes?: MdxJsxAttributeLike[];
  children: unknown[];
}

export function convertCallout(node: JsxNode, ctx: RenderContext): HastElement {
  const options = extractCalloutOptions(node.attributes);
  const children = ctx.convertChildren(node.children as RootContent[]);
  return buildCallout(options, children as HastElementContent[]);
}

export function convertCodeGroup(node: JsxNode, ctx: RenderContext): HastElement {
  const labels = extractCodeGroupLabels(node.attributes);

  if (labels === null) {
    throw new Error(CODE_GROUP_LABELS_ERROR);
  }

  const children = ctx.convertChildren(node.children as RootContent[]);
  return buildCodeGroup(labels, children as HastElementContent[]);
}

export function convertImage(node: JsxNode, ctx: RenderContext): HastElement {
  return buildImage(readMediaAttributes(node.attributes), {
    eager: ctx.nextImageIndex() < EAGER_IMAGE_COUNT,
  });
}

export function convertVideo(node: JsxNode): HastElement {
  return buildVideo(readMediaAttributes(node.attributes));
}
