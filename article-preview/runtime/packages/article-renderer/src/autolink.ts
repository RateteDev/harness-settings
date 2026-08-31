import type { Element } from "hast";

export function isAutolinkedParagraph(node: Element): string | null {
  if (node.tagName !== "p") {
    return null;
  }

  const meaningfulChildren = node.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === ""),
  );
  if (meaningfulChildren.length !== 1) {
    return null;
  }

  const link = meaningfulChildren[0];
  if (link?.type !== "element" || link.tagName !== "a") {
    return null;
  }

  const href = link.properties?.href;
  if (typeof href !== "string" || !href.startsWith("http")) {
    return null;
  }

  const text = link.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
    .trim();

  return text === href ? href : null;
}
