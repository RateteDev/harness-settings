import { buildFontFaceCss } from "./fonts.js";
import { renderArticle } from "./render-article.js";
import { buildHead } from "./render-full-html-head.js";
import { buildMinimalShell, buildPageShell, buildTocItems } from "./render-full-html-shell.js";
import type { RenderFullHtmlOptions, RenderFullHtmlResult } from "./types.js";

export async function renderFullHtml(
  source: string,
  opts: RenderFullHtmlOptions,
): Promise<RenderFullHtmlResult> {
  if (opts.siteUrl && !opts.slug) {
    throw new Error("renderFullHtml: opts.slug is required when opts.siteUrl is set");
  }

  const articleResult = await renderArticle(source, { media: opts.media });
  const {
    html: articleHtml,
    title,
    readingMinutes,
    headings,
    frontmatter: fm,
    diagnostics,
    monoText,
  } = articleResult;

  const fontFaceCss = await buildFontFaceCss(monoText);

  const head = buildHead({
    title,
    description: fm?.description ?? "",
    published: fm?.published ?? "",
    updated: fm?.updated ?? "",
    tags: fm?.tags ?? [],
    siteUrl: opts.siteUrl,
    slug: opts.slug,
    fontFaceCss,
    css: opts.css,
  });

  const tocItems = buildTocItems(headings);

  const pageShell = fm
    ? buildPageShell({
        title,
        description: fm.description,
        published: fm.published,
        updated: fm.updated,
        tags: fm.tags,
        readingMinutes,
        tocItems,
        articleHtml,
        interactionsScript: opts.interactionsScript,
      })
    : buildMinimalShell({
        title,
        tocItems,
        articleHtml,
        interactionsScript: opts.interactionsScript,
      });

  // TODO(standalone-fixed-theme): open. Today every standalone HTML ships the
  // picker, and the theme is chosen by the reader: the FOUC guard reads a saved
  // choice or a light OS preference over the default set here. The owner intends
  // to add a generation-time option that instead pins one theme and drops the
  // picker, the guard and the saved choice from the output entirely.
  //
  // Decide it together with TODO(mermaid-dual-render): a pinned theme is known
  // before the diagrams are rendered, so that output can bake the matching
  // palette and needs neither a second render pass nor the repaint layer that
  // carries the repository's only !important.
  const fullHtml = `<!doctype html>
<html lang="ja" data-theme="obsidian">
  <head>
  ${head}
  </head>
  <body>
${pageShell}
  </body>
</html>`;

  return { html: fullHtml, diagnostics };
}
