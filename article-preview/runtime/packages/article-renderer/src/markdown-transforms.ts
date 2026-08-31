import type { Heading, Root, RootContent } from "mdast";

function extractText(node: RootContent): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }
  if ("children" in node) {
    return (node.children as RootContent[]).map(extractText).join("");
  }
  return "";
}

export function extractFirstH1Text(tree: Root, options: { remove: boolean }): string {
  const index = tree.children.findIndex(
    (node): node is Heading => node.type === "heading" && node.depth === 1,
  );
  if (index === -1) {
    return "";
  }
  const heading = tree.children[index] as Heading;
  const title = extractText(heading as unknown as RootContent);
  if (options.remove) {
    tree.children.splice(index, 1);
  }
  return title;
}

interface AstroData {
  astro: { frontmatter: Record<string, unknown> };
}

export function remarkExtractH1() {
  return (tree: Root, file: { data: Record<string, unknown> }): void => {
    const title = extractFirstH1Text(tree, { remove: false });
    if (!title) {
      return;
    }
    const data = file.data as unknown as AstroData;
    data.astro ??= { frontmatter: {} };
    data.astro.frontmatter ??= {};
    data.astro.frontmatter.title = title;
  };
}
