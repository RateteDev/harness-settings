import { FOUC_GUARD_SCRIPT } from "./client/fouc-guard.js";
import { escapeHtml } from "./html-escape.js";

const SITE_NAME = "ratete.dev";

function buildSeoMeta(opts: {
  title: string;
  description: string;
  siteUrl: string;
  slug: string;
  published: string;
  updated: string;
}): string {
  const base = opts.siteUrl.replace(/\/$/, "");
  const canonical = `${base}/articles/${opts.slug}/`;
  const imageUrl = `${base}/og/${opts.slug}.png`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    url: canonical,
    datePublished: opts.published,
    dateModified: opts.updated,
  });

  return `  <link rel="canonical" href="${canonical}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta name="twitter:image" content="${imageUrl}" />
  <script type="application/ld+json">${jsonLd}</script>`;
}

export function buildHead(opts: {
  title: string;
  description: string;
  published: string;
  updated: string;
  tags: string[];
  siteUrl: string | undefined;
  slug: string | undefined;
  fontFaceCss: string;
  css: string;
}): string {
  const pageTitle = `${opts.title} | ${SITE_NAME}`;

  const tagMetas = opts.tags
    .map((tag) => `  <meta property="article:tag" content="${escapeHtml(tag)}" />`)
    .join("\n");

  const seo =
    opts.siteUrl && opts.slug
      ? buildSeoMeta({
          title: opts.title,
          description: opts.description,
          siteUrl: opts.siteUrl,
          slug: opts.slug,
          published: opts.published,
          updated: opts.updated,
        })
      : "";

  const articleMeta = opts.published
    ? `\n  <meta property="article:published_time" content="${opts.published}" />\n  <meta property="article:modified_time" content="${opts.updated}" />\n${tagMetas}`
    : "";

  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(opts.title)}" />
  <meta property="og:description" content="${escapeHtml(opts.description)}" />
  <meta property="og:site_name" content="${SITE_NAME}" />${articleMeta}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(opts.title)}" />
  <meta name="twitter:description" content="${escapeHtml(opts.description)}" />
${seo}
  <script>
    ${FOUC_GUARD_SCRIPT}
  </script>
  <style>
    ${opts.fontFaceCss}
  </style>
  <style>
${opts.css}
  </style>`;
}
