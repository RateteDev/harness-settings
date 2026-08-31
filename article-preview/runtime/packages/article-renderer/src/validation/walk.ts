export interface UnistLike {
  type: string;
  children?: unknown[];
  position?: { start: { line: number; column: number } };
}

export const UNKNOWN_POSITION = { line: 1, column: 1 };

export function positionOf(node: UnistLike): { line: number; column: number } {
  return node.position?.start ?? UNKNOWN_POSITION;
}

/** Depth-first walk over every node in the tree, parents before children. */
export function walk(node: UnistLike, visit: (node: UnistLike) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child as UnistLike, visit);
  }
}

export function isJsx(node: UnistLike, name?: string): boolean {
  const isJsxNode = node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
  if (!isJsxNode) {
    return false;
  }
  return name === undefined || (node as { name?: string | null }).name === name;
}

export function isHeading(node: UnistLike, depths: number[]): boolean {
  const candidate = node as { type: string; depth?: number };
  return candidate.type === "heading" && depths.includes(candidate.depth ?? 0);
}

/** The rendered text of a node, with the markup that produced it discarded. */
export function textOf(node: UnistLike): string {
  const candidate = node as UnistLike & { value?: string };
  if (typeof candidate.value === "string") {
    return candidate.value;
  }
  return (candidate.children ?? []).map((child) => textOf(child as UnistLike)).join("");
}
