import type GithubSlugger from "github-slugger";
import type { Node as HastNode } from "hast";
import type { RootContent } from "mdast";
import type { createHighlighter } from "shiki";
import type { Diagnostic, Heading } from "./types.js";

export type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

export interface NodeTransformerContext {
  slugger: GithubSlugger;
  headings: Heading[];
  diagnostics: Diagnostic[];
  highlighter: Highlighter;
  uid: (seed: string) => string;
  /**
   * The 0-based position of the next image in the document, in document order.
   * Which images load eagerly is decided from it.
   */
  nextImageIndex: () => number;
  convertChildren: (children: RootContent[]) => HastNode[];
}

export type NodeTransformer = (
  node: RootContent,
  ctx: NodeTransformerContext,
) => HastNode | null | undefined;

export interface RenderContext extends NodeTransformerContext {
  transformers: NodeTransformer[];
}

export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
