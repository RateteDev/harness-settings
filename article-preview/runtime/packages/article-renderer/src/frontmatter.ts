/**
 * The closed vocabulary an article frontmatter may carry, and the parser that
 * reads it. The specification these keys come from is
 * `docs/spec/記事メタデータの仕様.md`; the values are shared, while how each
 * renderer uses them is not.
 *
 * Every field is optional here. A document is expected to be brought to this
 * specification before it is opened, but requiring a field would refuse a
 * document the renderer can draw; the web app layers its own required set on
 * top through its content schema.
 *
 * A key outside the specification is reported and dropped rather than refused:
 * it is worth telling the converter about, not worth withholding the output
 * over. A specified field carrying a malformed value is an error, because the
 * specification is the one thing the document was supposed to be brought to.
 */
import { parse as parseYaml } from "yaml";

/** Where an article sits on the single path towards publication. */
export const ARTICLE_STATUSES = ["draft", "published", "archived", "deleted"] as const;

export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Status assumed for a document that carries no `status`. */
export const DEFAULT_ARTICLE_STATUS: ArticleStatus = "published";

export interface Frontmatter {
  /** Sole classification the article belongs to, written as the label itself. */
  category?: string;
  /**
   * Summary of the article. Read by people under the title and on list cards,
   * and handed to meta description, feeds and share cards.
   */
  description?: string;
  author?: string;
  /** Publication instant in ISO 8601, offset included. */
  published?: string;
  /** Last modification instant in ISO 8601, offset included. */
  updated?: string;
  tags: string[];
  /** Site-absolute path to the 16:9 image representing the article. */
  image?: string;
  status: ArticleStatus;
  /** Instant the owner last proof-read the body, in ISO 8601. */
  reviewed?: string;
}

export type ArticleFrontmatterKey = keyof Frontmatter;

/**
 * Single source of the vocabulary. Keys outside this list are dropped from the
 * result and reported through `unknownKeys`, never silently: a mistyped `tag`
 * would otherwise leave an article without the value its author meant to give
 * it and nobody the wiser.
 */
export const ARTICLE_FRONTMATTER_KEYS = [
  "category",
  "description",
  "author",
  "published",
  "updated",
  "tags",
  "image",
  "status",
  "reviewed",
] as const satisfies readonly ArticleFrontmatterKey[];

/** Fields carrying a plain string, all read the same way. */
const STRING_KEYS = [
  "category",
  "description",
  "author",
  "published",
  "updated",
  "image",
  "reviewed",
] as const satisfies readonly ArticleFrontmatterKey[];

export function parseFrontmatter(source: string): { frontmatter: unknown; body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) {
    return { frontmatter: {}, body: source };
  }
  const frontmatter = parseYaml(match[1]);
  return { frontmatter, body: match[2] };
}

function readString(fm: Record<string, unknown>, key: ArticleFrontmatterKey): string | undefined {
  const value = fm[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Frontmatter field "${key}" must be a string`);
  }
  return value;
}

function readTags(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error('Frontmatter field "tags" must be an array of strings');
  }
  return value as string[];
}

function readStatus(value: unknown): ArticleStatus {
  if (value === undefined || value === null) {
    return DEFAULT_ARTICLE_STATUS;
  }
  if (typeof value !== "string" || !(ARTICLE_STATUSES as readonly string[]).includes(value)) {
    throw new Error(
      `Frontmatter field "status" must be one of ${ARTICLE_STATUSES.join(", ")}, got ${JSON.stringify(value)}`,
    );
  }
  return value as ArticleStatus;
}

export interface FrontmatterReadResult {
  /** Null when the document offers nothing to build a header from. */
  frontmatter: Frontmatter | null;
  /** Keys outside the specification, dropped from the result. The caller decides how to surface them. */
  unknownKeys: string[];
}

/**
 * Reads a parsed frontmatter into the shared shape. Keys outside the
 * specification are dropped and returned in `unknownKeys`; a malformed value
 * on a specified field throws. `frontmatter` is null when the document carries
 * no frontmatter, or none of its keys is in the specification — either way
 * there is nothing to render a header from.
 */
export function validateFrontmatter(raw: unknown): FrontmatterReadResult {
  if (typeof raw !== "object" || raw === null || Object.keys(raw).length === 0) {
    return { frontmatter: null, unknownKeys: [] };
  }
  const fm = raw as Record<string, unknown>;

  const unknownKeys = Object.keys(fm).filter(
    (key) => !(ARTICLE_FRONTMATTER_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length === Object.keys(fm).length) {
    return { frontmatter: null, unknownKeys };
  }

  const frontmatter: Frontmatter = {
    tags: readTags(fm.tags),
    status: readStatus(fm.status),
  };
  for (const key of STRING_KEYS) {
    const value = readString(fm, key);
    if (value !== undefined) {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, unknownKeys };
}
