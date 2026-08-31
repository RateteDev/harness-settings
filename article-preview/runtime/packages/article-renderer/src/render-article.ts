import GithubSlugger from "github-slugger";
import type { Element as HastElement, Node as HastNode, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import type { RootContent } from "mdast";
import { getHighlighter } from "./article-source.js";
import { buildFontCssDataUrl } from "./fonts.js";
import { parseFrontmatter, validateFrontmatter } from "./frontmatter.js";
import rehypeMermaid, { type GetPngUriFn } from "./hast/mermaid.js";
import {
  rehypeCodeBlock,
  rehypeHeadingLink,
  rehypeHeadingPhraseWrap,
  rehypeTableWrap,
} from "./hast-transforms.js";
import { extractFirstH1Text } from "./markdown-transforms.js";
import { convertChildren, convertNode } from "./mdast-to-hast.js";
import { parseMdx } from "./mdx-parse.js";
import { type MediaResolveOptions, resolveMedia } from "./media-resolve.js";
import { createDefaultMermaidRender, type MermaidRenderFn } from "./mermaid-render.js";
import { collectMonoText } from "./mono-text.js";
import { estimateReadingMinutes } from "./reading-time.js";
import { hashString, type NodeTransformer, type RenderContext } from "./render-context.js";
import { svgToPng } from "./svg-to-png.js";
import { rehypeTweetCard } from "./tweet-card.js";
import { fetchTweet } from "./tweet-card-api.js";
import type { Diagnostic, Heading, RenderArticleResult } from "./types.js";
import { rehypeUrlCard } from "./url-card.js";
import { fetchOgp } from "./url-card-ogp.js";

export type { NodeTransformer, NodeTransformerContext } from "./render-context.js";

export interface RenderArticleOptions {
  /** Node transformers to run before the built-in conversion branches. */
  transformers?: NodeTransformer[];
  /**
   * Mermaid SVG renderer override. Defaults to a headless-browser renderer.
   * Tests inject a stub to avoid launching a browser.
   */
  mermaidRender?: MermaidRenderFn;
  /**
   * PNG URI resolver for Mermaid diagrams. When provided, each rendered SVG is
   * also converted to PNG and the URI is stored in the copy button's data-png
   * attribute. Defaults to base64 data URI embedding for self-contained HTML.
   */
  getPngUri?: GetPngUriFn;
  fetchTweet?: typeof fetchTweet;
  fetchOgp?: typeof fetchOgp;
  /**
   * How the references of <Image> and <Video> are answered. Left out, every
   * reference stays exactly as the author wrote it, which is what a site serving
   * its own media needs; the CLI sets it because its output is handed on.
   */
  media?: MediaResolveOptions;
}

export async function renderArticle(
  source: string,
  options: RenderArticleOptions = {},
): Promise<RenderArticleResult> {
  const { frontmatter: rawFm } = parseFrontmatter(source);
  const { frontmatter } = validateFrontmatter(rawFm);
  const diagnostics: Diagnostic[] = [];

  const mdast = parseMdx(source);
  const title = extractFirstH1Text(mdast, { remove: true });
  const readingMinutes = estimateReadingMinutes(mdast);

  const highlighter = await getHighlighter();
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];

  let uidCounter = 0;
  let imageCounter = 0;
  const ctx: RenderContext = {
    slugger,
    headings,
    diagnostics,
    highlighter,
    transformers: options.transformers ?? [],
    uid: (seed: string) => `${uidCounter++}-${hashString(seed)}`,
    nextImageIndex: () => imageCounter++,
    convertChildren: (children) => convertChildren(children, ctx),
  };

  const hastChildren: HastNode[] = [];
  for (const node of mdast.children) {
    if (node.type === "yaml") {
      continue;
    }
    const converted = convertNode(node as RootContent, ctx);
    if (converted !== null) {
      hastChildren.push(converted);
    }
  }

  const wrapperHast: HastElement = {
    type: "element",
    tagName: "div",
    properties: { "data-ratete-article": true },
    children: hastChildren as HastElement["children"],
  };

  const sharedTree = wrapperHast as unknown as HastRoot;
  await rehypeTweetCard({ fetchTweet: options.fetchTweet ?? fetchTweet })(sharedTree);
  await rehypeUrlCard({ fetchOgp: options.fetchOgp ?? fetchOgp })(sharedTree);
  const defaultGetPngUri: GetPngUriFn = async (svg) => {
    try {
      const png = svgToPng(svg);
      const b64 = Buffer.from(png).toString("base64");
      return `data:image/png;base64,${b64}`;
    } catch {
      return undefined;
    }
  };

  // Collected before the diagram transform, while the Mermaid source is still a
  // code element, and returned so the embedded @font-face is built from the very
  // same characters the headless browser measures against.
  const monoText = collectMonoText(sharedTree);

  await rehypeMermaid({
    render: async (sources) => {
      const render =
        options.mermaidRender ?? createDefaultMermaidRender(await buildFontCssDataUrl(monoText));
      return render(sources);
    },
    getPngUri: options.getPngUri ?? defaultGetPngUri,
  })(sharedTree);
  if (options.media) {
    await resolveMedia(sharedTree, options.media);
  }
  rehypeCodeBlock()(sharedTree);
  rehypeTableWrap()(sharedTree);
  rehypeHeadingPhraseWrap()(sharedTree);
  rehypeHeadingLink()(sharedTree);

  const html = toHtml(wrapperHast, { allowDangerousHtml: true });

  return { html, title, readingMinutes, headings, frontmatter, diagnostics, monoText };
}
