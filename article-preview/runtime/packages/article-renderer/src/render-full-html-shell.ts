import { formatDateJa } from "./format-date.js";
import { escapeHtml } from "./html-escape.js";
import {
  bookOpenIconString,
  calendarIconString,
  clockIconString,
  tagIconString,
  withSvgClass,
} from "./icons.js";
import { phraseWrap } from "./phrase-wrap.js";
import { THEME_PICKER_HTML } from "./theme-picker.js";
import type { Heading } from "./types.js";

export function buildTocItems(headings: Heading[]): string {
  const h2s = headings.filter((h) => h.depth === 2);
  return h2s
    .map((h, i) => {
      const num = String(i + 1).padStart(2, "0");
      return `<li data-target="${escapeHtml(h.slug)}"><a class="reading-toc-link" href="#${escapeHtml(h.slug)}"><span class="reading-toc-num">${num}</span><span class="reading-toc-text">${escapeHtml(phraseWrap(h.text))}</span></a></li>`;
    })
    .join("\n          ");
}

const CALENDAR_ICON = withSvgClass(calendarIconString, "reading-meta-icon");
const CLOCK_ICON = withSvgClass(clockIconString, "reading-meta-icon");
const BOOK_ICON = withSvgClass(bookOpenIconString, "reading-meta-icon");
const TAG_ICON = withSvgClass(tagIconString, "reading-meta-icon");

/**
 * The bar the page opens with, holding the theme picker. It sits outside the
 * reading frame and does not follow the scroll; the stylesheet that gives it
 * its rule explains why.
 */
const READING_TOPBAR = `<header class="reading-topbar">
      <div class="reading-topbar-inner reading-measure">
        ${THEME_PICKER_HTML.trimEnd()}
      </div>
    </header>`;

function buildTocAndContent(opts: { tocItems: string; articleHtml: string }): string {
  return `        <nav class="reading-toc" aria-labelledby="tocLabel">
          <p class="reading-toc-title" id="tocLabel">目次</p>
          <ul class="reading-toc-list" id="tocList">
            ${opts.tocItems}
          </ul>
        </nav>

        <div class="reading-content">
          ${opts.articleHtml}
        </div>`;
}

function buildHero(opts: {
  title: string;
  description?: string;
  published?: string;
  updated?: string;
  tags: string[];
  readingMinutes: number;
}): string {
  const tagLinks = opts.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ");
  const description = opts.description
    ? `
          <p class="reading-description">${escapeHtml(opts.description)}</p>`
    : "";
  const published = opts.published
    ? `
            <span class="reading-meta-item">
              ${CALENDAR_ICON}
              <span class="reading-meta-text">
                <span class="reading-meta-label">公開日：</span>
                <time class="reading-meta-value" datetime="${escapeHtml(opts.published)}">${escapeHtml(formatDateJa(opts.published))}</time>
              </span>
            </span>`
    : "";
  const updated =
    !opts.updated || opts.updated === opts.published
      ? ""
      : `
            <span class="reading-meta-item">
              ${CLOCK_ICON}
              <span class="reading-meta-text">
                <span class="reading-meta-label">更新日：</span>
                <time class="reading-meta-value" datetime="${escapeHtml(opts.updated)}">${escapeHtml(formatDateJa(opts.updated))}</time>
              </span>
            </span>`;
  const tags =
    opts.tags.length === 0
      ? ""
      : `
            <span class="reading-meta-item">
              ${TAG_ICON}
              <span class="reading-meta-text">
                <span class="reading-meta-label">タグ：</span>
                <span class="reading-meta-value reading-meta-tags">${tagLinks}</span>
              </span>
            </span>`;
  return `        <div class="reading-hero">
          <h1 class="reading-title">${escapeHtml(phraseWrap(opts.title))}</h1>${description}
          <div class="reading-meta">${published}${updated}
            <span class="reading-meta-item">
              ${BOOK_ICON}
              <span class="reading-meta-text">
                <span class="reading-meta-label">読了時間：</span>
                <span class="reading-meta-value">約${opts.readingMinutes}分</span>
              </span>
            </span>${tags}
          </div>
        </div>`;
}

/** Page shell for an article with frontmatter: hero (description/meta), TOC and content. */
export function buildPageShell(opts: {
  title: string;
  description?: string;
  published?: string;
  updated?: string;
  tags: string[];
  readingMinutes: number;
  tocItems: string;
  articleHtml: string;
  interactionsScript: string;
}): string {
  return `    ${READING_TOPBAR}
    <main class="reading-page reading-measure">
      <article class="reading-article">
${buildHero(opts)}

${buildTocAndContent(opts)}
      </article>
    </main>

    <script>
      ${opts.interactionsScript}
    </script>`;
}

/** Page shell for an article without frontmatter: optional title, TOC and content. */
export function buildMinimalShell(opts: {
  title: string;
  tocItems: string;
  articleHtml: string;
  interactionsScript: string;
}): string {
  const titleHtml = opts.title
    ? `\n        <div class="reading-hero">\n          <h1 class="reading-title">${escapeHtml(phraseWrap(opts.title))}</h1>\n        </div>\n`
    : "";
  return `    ${READING_TOPBAR}
    <main class="reading-page reading-measure">
      <article class="reading-article">${titleHtml}
${buildTocAndContent(opts)}
      </article>
    </main>

    <script>
      ${opts.interactionsScript}
    </script>`;
}
