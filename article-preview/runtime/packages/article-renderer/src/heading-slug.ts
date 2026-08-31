import GithubSlugger from "github-slugger";
import type { Element, Node as HastNode, Root, Text } from "hast";

const SLUGGED_DEPTHS = [2, 3, 4, 5, 6];

/**
 * The text a heading's anchor is derived from: every text node under the
 * heading, concatenated. Shared by both renderers so an anchor never depends on
 * which one produced the page.
 */
export function extractHeadingText(node: HastNode): string {
  if (node.type === "text") {
    return (node as Text).value;
  }
  if ("children" in node && Array.isArray((node as Element).children)) {
    return (node as Element).children.map(extractHeadingText).join("");
  }
  return "";
}

function headingDepth(node: HastNode): number | null {
  if (node.type !== "element") {
    return null;
  }
  const match = /^h([1-6])$/.exec((node as Element).tagName);
  return match ? Number.parseInt(match[1], 10) : null;
}

function assignSlugs(node: HastNode, slugger: GithubSlugger): void {
  const depth = headingDepth(node);
  if (depth !== null && SLUGGED_DEPTHS.includes(depth)) {
    const element = node as Element;
    element.properties = element.properties ?? {};
    element.properties.id = slugger.slug(extractHeadingText(element));
    return;
  }
  if ("children" in node && Array.isArray((node as Element).children)) {
    for (const child of (node as Element).children) {
      assignSlugs(child, slugger);
    }
  }
}

/**
 * Gives every h2 and below an id derived from the heading's own text.
 *
 * Astro assigns heading ids after the article's rehype plugins have run, and it
 * derives them from whatever the heading contains by then — which includes the
 * copy-link button and the zero-width spaces the phrase-wrap plugin inserts.
 * The portable renderer instead slugs the heading before it decorates it, so
 * the two disagreed on what a heading is called. Claiming the id here settles
 * it at the same point on both sides; Astro keeps an id that is already set and
 * reports it as the heading's slug, so the table of contents follows.
 *
 * Must run before any plugin that puts something inside a heading.
 */
export function rehypeHeadingSlug() {
  return (tree: Root): void => {
    const slugger = new GithubSlugger();
    assignSlugs(tree as unknown as HastNode, slugger);
  };
}
