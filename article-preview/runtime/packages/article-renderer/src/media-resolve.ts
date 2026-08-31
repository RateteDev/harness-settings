import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Element as HastElement, Root as HastRoot } from "hast";
import { isVideoReference, mediaTypeOf } from "./media.js";

/**
 * How a standalone HTML answers its media references.
 *
 * - `inline` embeds every file as a data URI, so the document survives being
 *   handed to someone with no access to where the originals live.
 * - `link` keeps the references as written, which requires every one of them to
 *   be an absolute URL. A local path left in a document meant to be sent stays
 *   unreachable for whoever receives it, so it stops generation instead.
 */
export type MediaMode = "inline" | "link";

export interface MediaBytes {
  bytes: Uint8Array;
  /** What the server said the file is, or null when it said nothing. */
  contentType: string | null;
}

export type FetchMedia = (url: string) => Promise<MediaBytes>;
/** The size of a remote file in bytes, or null when the server does not say. */
export type MeasureMedia = (url: string) => Promise<number | null>;

export interface MediaResolveOptions {
  mode: MediaMode;
  /** The directory a relative reference is resolved against. */
  baseDir: string;
  /**
   * Where the size estimate goes. It is reported before anything is downloaded,
   * which is the only moment at which knowing the total is still useful.
   */
  warn: (message: string) => void;
  fetchMedia?: FetchMedia;
  measureMedia?: MeasureMedia;
}

/**
 * The reference is named in the failure. What a bare network error says is that
 * a host could not be reached, not which figure of which article sent us there.
 */
async function request(url: string, method: "GET" | "HEAD"): Promise<Response> {
  try {
    return await fetch(url, { method });
  } catch (cause) {
    throw new Error(`Failed to reach media "${url}": ${String(cause)}`);
  }
}

export const defaultFetchMedia: FetchMedia = async (url) => {
  const response = await request(url, "GET");
  if (!response.ok) {
    throw new Error(`Failed to fetch media "${url}": HTTP ${response.status}`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
};

export const defaultMeasureMedia: MeasureMedia = async (url) => {
  const response = await request(url, "HEAD");
  if (!response.ok) {
    return null;
  }
  const length = response.headers.get("content-length");
  if (length === null) {
    return null;
  }
  const parsed = Number(length);
  return Number.isFinite(parsed) ? parsed : null;
};

function isRemote(reference: string): boolean {
  return reference.startsWith("http://") || reference.startsWith("https://");
}

function isEmbedded(reference: string): boolean {
  return reference.startsWith("data:");
}

interface MediaReference {
  element: HastElement;
  source: string;
}

function isMediaFigure(element: HastElement): boolean {
  return element.tagName === "figure" && element.properties?.class === "media";
}

/**
 * The <img> and <video> of <Image> / <Video>, and nothing else. Card artwork
 * carries remote URLs too, but a card is drawn from what a fetch returned rather
 * than from a reference the author wrote, and how it survives being handed on is
 * the card's own business.
 */
function collectReferences(tree: HastRoot): MediaReference[] {
  const found: MediaReference[] = [];
  const visit = (node: { children?: unknown[] }, insideFigure: boolean): void => {
    for (const child of node.children ?? []) {
      const element = child as HastElement;
      if (element.type !== "element") {
        continue;
      }
      const isMedia = element.tagName === "img" || element.tagName === "video";
      if (insideFigure && isMedia) {
        const source = element.properties?.src;
        if (typeof source === "string" && !isEmbedded(source)) {
          found.push({ element, source });
        }
      }
      visit(element as { children?: unknown[] }, insideFigure || isMediaFigure(element));
    }
  };
  visit(tree as unknown as { children?: unknown[] }, false);
  return found;
}

function localPathOf(reference: string, baseDir: string): string {
  return isAbsolute(reference) ? reference : resolve(baseDir, reference);
}

/**
 * The reference is named in the failure, for the same reason `request()` names
 * it: a bare ENOENT says a path was missing, not which figure asked for it.
 */
function readLocalSize(reference: MediaReference, baseDir: string): number {
  try {
    return statSync(localPathOf(reference.source, baseDir)).size;
  } catch (cause) {
    throw new Error(`Failed to read media "${reference.source}": ${String(cause)}`);
  }
}

function readLocalBytes(reference: MediaReference, baseDir: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(localPathOf(reference.source, baseDir)));
  } catch (cause) {
    throw new Error(`Failed to read media "${reference.source}": ${String(cause)}`);
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

/**
 * The base64 of n bytes takes 4 characters per 3 bytes. The estimate is what the
 * document grows by, which is the number the reader of the warning is deciding
 * against.
 */
function encodedSize(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

async function warnAboutVideos(
  references: MediaReference[],
  options: MediaResolveOptions,
): Promise<void> {
  const videos = references.filter((reference) => isVideoReference(reference.source));
  if (videos.length === 0) {
    return;
  }

  const measure = options.measureMedia ?? defaultMeasureMedia;
  let known = 0;
  let unknown = 0;
  for (const video of videos) {
    const size = isRemote(video.source)
      ? await measure(video.source)
      : readLocalSize(video, options.baseDir);
    if (size === null) {
      unknown += 1;
      continue;
    }
    known += size;
  }

  const unknownNote = unknown === 0 ? "" : `, plus ${unknown} whose size the server did not give`;
  options.warn(
    `Embedding ${videos.length} video(s): ${megabytes(known)} of source, about ${megabytes(encodedSize(known))} once base64-encoded${unknownNote}.`,
  );
}

async function embed(reference: MediaReference, options: MediaResolveOptions): Promise<void> {
  const fetchBytes = options.fetchMedia ?? defaultFetchMedia;
  const { bytes, contentType } = isRemote(reference.source)
    ? await fetchBytes(reference.source)
    : {
        bytes: readLocalBytes(reference, options.baseDir),
        contentType: null,
      };

  // The server knows what it served; the extension is what is left to go on when
  // it says nothing. Neither being available is an error rather than a guess.
  const mediaType = contentType ?? mediaTypeOf(reference.source);
  if (mediaType === null) {
    throw new Error(
      `Cannot embed "${reference.source}": neither the response nor the file extension says what it is.`,
    );
  }

  const base64 = Buffer.from(bytes).toString("base64");
  reference.element.properties = {
    ...reference.element.properties,
    src: `data:${mediaType};base64,${base64}`,
  };
}

/**
 * Resolves every media reference in a rendered article for standalone HTML.
 * The web never calls this: its pages are served from the same site as the
 * media, so the references stay exactly as the author wrote them.
 */
export async function resolveMedia(tree: HastRoot, options: MediaResolveOptions): Promise<void> {
  const references = collectReferences(tree);
  if (references.length === 0) {
    return;
  }

  if (options.mode === "link") {
    const local = references.filter((reference) => !isRemote(reference.source));
    if (local.length > 0) {
      const listed = local.map((reference) => reference.source).join(", ");
      throw new Error(
        `--media link keeps references as written, and these cannot be reached from anywhere but this machine: ${listed}. Use --media inline, or move the files to a URL.`,
      );
    }
    return;
  }

  await warnAboutVideos(references, options);
  for (const reference of references) {
    await embed(reference, options);
  }
}
