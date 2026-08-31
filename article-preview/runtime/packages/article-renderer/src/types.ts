export type { Frontmatter } from "./frontmatter.js";

export type DiagnosticLevel = "error" | "warning" | "info";

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  node?: string;
}

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

export interface RenderArticleResult {
  html: string;
  title: string;
  /** Estimated reading time in whole minutes (at least 1). */
  readingMinutes: number;
  headings: Heading[];
  frontmatter: Frontmatter | null;
  diagnostics: Diagnostic[];
  /**
   * Every character the rendered article draws in `--font-mono`, for building
   * the embedded font subset. See `collectMonoText`.
   */
  monoText: string;
}

export interface RenderFullHtmlOptions {
  /**
   * Site base URL. When provided together with `slug`, canonical/OG/JSON-LD
   * metadata is emitted. When omitted, the output stays self-contained and
   * site-dependent metadata is skipped.
   */
  siteUrl?: string;
  /** Article slug for canonical/OG URLs. Required only when `siteUrl` is set. */
  slug?: string;
  /**
   * Client-side interactions script (code copy, TOC scroll sync, tabs, etc.) to
   * embed as a classic `<script>` in the rendered shell. Callers must build this
   * explicitly (e.g. by bundling `@ratete/article-renderer/client-entry`) — there
   * is no default or fallback script.
   */
  interactionsScript: string;
  /**
   * The page's whole stylesheet, inlined into `<head>` as-is. The renderer holds
   * no CSS of its own: the caller passes the copy generated from
   * `packages/article-renderer/styles/`, so a delivery form that ships on its
   * own carries its own stylesheet rather than reaching back into this package.
   */
  css: string;
  /**
   * How the references of <Image> and <Video> are answered. Left out, they stay
   * as written; see {@link MediaResolveOptions}.
   */
  media?: MediaResolveOptions;
}

export interface RenderFullHtmlResult {
  html: string;
  diagnostics: Diagnostic[];
}
