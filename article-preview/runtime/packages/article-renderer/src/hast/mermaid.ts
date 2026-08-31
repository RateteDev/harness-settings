import type { Element, ElementContent, Properties, Root, Text } from "hast";
import { visit } from "unist-util-visit";
import { buildMermaidElement } from "./mermaid-element.js";
import { stripFrontmatterTitle } from "./mermaid-frontmatter.js";

/**
 * Rehype plugin that replaces Mermaid code blocks with a managed diagram wrapper
 * whose preview is a build-time prerendered inline SVG.
 *
 * Astro markdown usually runs Shiki first, so this plugin accepts both shapes:
 *   1. Shiki output: `<pre class="shiki" data-language="mermaid">...</pre>`.
 *   2. Plain output: `<pre><code class="language-mermaid">SOURCE</code></pre>`.
 *
 * The output contains a header, a copy button, a raw-source toggle, a
 * `.mermaid` preview holding the rendered SVG, and a hidden
 * `<pre class="mermaid-raw">`. Rendering happens at build time via a headless
 * browser, so no Mermaid runtime is shipped to the client.
 */

function getClassList(properties: Properties | undefined): string[] {
  if (!properties) return [];
  const cls = properties.className;
  if (Array.isArray(cls)) return cls.map(String);
  if (typeof cls === "string") return cls.split(/\s+/).filter(Boolean);
  return [];
}

function extractText(node: ElementContent | Element | Root): string {
  if (node.type === "text") {
    return (node as Text).value;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return (node.children as ElementContent[]).map(extractText).join("");
  }
  return "";
}

function isMermaidPre(node: Element): { source: string } | null {
  if (node.tagName !== "pre") return null;

  const props = (node.properties ?? {}) as Properties & Record<string, unknown>;
  const dataLanguage = props.dataLanguage ?? props["data-language"];
  if (dataLanguage === "mermaid") {
    const source = extractText(node);
    return { source };
  }

  for (const child of node.children) {
    if (child.type !== "element") continue;
    const el = child as Element;
    if (el.tagName !== "code") continue;
    if (getClassList(el.properties).some((c) => c === "language-mermaid")) {
      const source = extractText(el);
      return { source };
    }
  }

  return null;
}

/**
 * Renders Mermaid sources to inline SVG strings, aligned by input index.
 * A `null` entry marks a diagram whose rendering failed.
 */
export type MermaidRenderFn = (sources: string[]) => Promise<(string | null)[]>;

/**
 * Callback that receives a rendered SVG and its Mermaid source, returns a URI
 * for its PNG representation. Web consumers return a static asset path; CLI
 * consumers return a base64 data URI for self-contained HTML. Return
 * `undefined` to skip PNG embedding (e.g. on conversion failure).
 */
export type GetPngUriFn = (
  svg: string,
  index: number,
  source: string,
) => Promise<string | undefined>;

export interface RehypeMermaidOptions {
  render: MermaidRenderFn;
  getPngUri?: GetPngUriFn;
}

interface MermaidMatch {
  parent: Root | Element;
  node: Element;
  source: string;
}

export default function rehypeMermaid(options: RehypeMermaidOptions) {
  const { render, getPngUri } = options;
  return async (tree: Root) => {
    const matches: MermaidMatch[] = [];
    visit(tree, "element", (node, _index, parent) => {
      if (!parent) return;
      const match = isMermaidPre(node);
      if (!match) return;
      matches.push({ parent: parent as Root | Element, node, source: match.source });
    });
    if (matches.length === 0) return;

    const prepared = matches.map((match) => {
      const trimmed = match.source.replace(/\n+$/, "");
      return { match, trimmed, renderSource: stripFrontmatterTitle(trimmed) };
    });
    const svgs = await render(prepared.map((item) => item.renderSource));

    const pngUris = getPngUri
      ? await Promise.all(
          svgs.map((svg, i) =>
            svg ? getPngUri(svg, i, prepared[i].trimmed) : Promise.resolve(undefined),
          ),
        )
      : [];

    prepared.forEach(({ match, trimmed, renderSource }, index) => {
      const position = match.parent.children.indexOf(match.node);
      if (position === -1) return;
      match.parent.children[position] = buildMermaidElement(
        trimmed,
        renderSource,
        index,
        svgs[index] ?? null,
        pngUris[index],
      );
    });
  };
}
