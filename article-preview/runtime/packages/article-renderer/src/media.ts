import type { Element as HastElement, ElementContent as HastElementContent } from "hast";
import type { MdxJsxAttributeLike } from "./mdx-components.js";

/**
 * `<Image>` and `<Video>`: the only way an article carries a picture or a clip.
 *
 * Both draw the same frame — a `<figure>` holding the media and an optional
 * `<figcaption>` — from the builders below, so the two renderers cannot drift
 * into different structures. The author writes what the media *is*; everything
 * that decides how it loads is fixed here, which is also why neither component
 * accepts `class` or `style`.
 *
 * TODO(video-alt): open. A video has nowhere to put alternative text: `caption`
 * is optional and describes the figure, not the content. A clip with no textual
 * equivalent can therefore be published. Decide whether to require a caption on
 * `<Video>` or to give it a separate description attribute.
 */

/**
 * How many images at the head of an article load eagerly. What follows is
 * deferred: the browser's lazy heuristic is the right call for media the reader
 * has not scrolled to, and the wrong one for the figure that opens the article.
 */
export const EAGER_IMAGE_COUNT = 1;

/** Every attribute `<Image>` accepts. Anything else is a validation error. */
export const IMAGE_ATTRIBUTES = ["src", "alt", "ratio", "caption"] as const;

/** Every attribute `<Video>` accepts. Anything else is a validation error. */
export const VIDEO_ATTRIBUTES = ["src", "ratio", "caption", "loop"] as const;

/** The attributes written bare (`loop`) rather than with a value. */
export const BOOLEAN_MEDIA_ATTRIBUTES = ["loop"] as const;

/**
 * `<width>/<height>`. The value reaches CSS as `aspect-ratio: auto <ratio>`, so
 * it is matched rather than trusted: anything else written here would be a
 * declaration of the author's choosing inside the frame's style attribute.
 */
const RATIO_PATTERN = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;

/** The ratio in its canonical spacing, or null when the value is not a ratio. */
export function normalizeRatio(value: string): string | null {
  const match = RATIO_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  return `${match[1]} / ${match[2]}`;
}

export interface MediaAttributes {
  /** Null when absent, or when written as something other than a string. */
  src: string | null;
  alt: string | null;
  ratio: string | null;
  caption: string | null;
  loop: boolean;
}

function stringAttribute(
  attributes: MdxJsxAttributeLike[] | undefined,
  name: string,
): string | null {
  for (const attribute of attributes ?? []) {
    if (attribute.type === "mdxJsxAttribute" && attribute.name === name) {
      return typeof attribute.value === "string" ? attribute.value : null;
    }
  }
  return null;
}

function hasBareAttribute(attributes: MdxJsxAttributeLike[] | undefined, name: string): boolean {
  return (attributes ?? []).some(
    (attribute) =>
      attribute.type === "mdxJsxAttribute" &&
      attribute.name === name &&
      (attribute.value === null || attribute.value === undefined),
  );
}

/**
 * Reads what the builders need off a `<Image>` / `<Video>` node. Values written
 * in a form the components do not accept read as absent here; reporting them is
 * the validator's job, and this stays the one place that knows the shape.
 */
export function readMediaAttributes(
  attributes: MdxJsxAttributeLike[] | undefined,
): MediaAttributes {
  return {
    src: stringAttribute(attributes, "src"),
    alt: stringAttribute(attributes, "alt"),
    ratio: stringAttribute(attributes, "ratio"),
    caption: stringAttribute(attributes, "caption"),
    loop: hasBareAttribute(attributes, "loop"),
  };
}

/**
 * Reserves the space the media will occupy. `auto <ratio>` uses the given ratio
 * until the intrinsic one is known and switches to that, so a wrong ratio costs
 * one reflow rather than a permanently distorted frame.
 *
 * Nothing is emitted when the ratio is absent, which only happens in the CLI:
 * the standalone HTML declares the fallback ratio in its own CSS, and the web
 * requires the attribute.
 */
function ratioStyle(ratio: string | null): string | undefined {
  if (ratio === null) {
    return undefined;
  }
  const normalized = normalizeRatio(ratio);
  if (normalized === null) {
    throw new Error(
      `<Image>/<Video> ratio must be written as <width>/<height>, e.g. ratio="16/9". Got "${ratio}". Validate the source before rendering it.`,
    );
  }
  return `aspect-ratio: auto ${normalized};`;
}

function requireSrc(source: string | null, component: string): string {
  if (source === null || source === "") {
    throw new Error(
      `<${component}> requires a src attribute written as a string. Validate the source before rendering it.`,
    );
  }
  return source;
}

function buildFigure(media: HastElement, caption: string | null): HastElement {
  const children: HastElementContent[] = [media];
  if (caption !== null && caption !== "") {
    children.push({
      type: "element",
      tagName: "figcaption",
      properties: { class: "media-caption" },
      children: [{ type: "text", value: caption }],
    });
  }
  return {
    type: "element",
    tagName: "figure",
    properties: { class: "media" },
    children,
  };
}

export interface BuildImageOptions {
  /** True for the first {@link EAGER_IMAGE_COUNT} images of the article. */
  eager: boolean;
}

export function buildImage(attributes: MediaAttributes, options: BuildImageOptions): HastElement {
  const image: HastElement = {
    type: "element",
    tagName: "img",
    properties: {
      src: requireSrc(attributes.src, "Image"),
      alt: attributes.alt ?? "",
      style: ratioStyle(attributes.ratio),
      decoding: "async",
      loading: options.eager ? "eager" : "lazy",
    },
    children: [],
  };
  return buildFigure(image, attributes.caption);
}

/**
 * A clip the reader starts. It never autoplays, so no motion begins on its own
 * and the sound that arrives is sound the reader asked for; `preload` fetches
 * only enough to show a first frame and a duration.
 */
export function buildVideo(attributes: MediaAttributes): HastElement {
  const video: HastElement = {
    type: "element",
    tagName: "video",
    properties: {
      src: requireSrc(attributes.src, "Video"),
      style: ratioStyle(attributes.ratio),
      controls: true,
      preload: "metadata",
      playsInline: true,
      loop: attributes.loop,
    },
    children: [],
  };
  return buildFigure(video, attributes.caption);
}

/**
 * The media types an article may carry, keyed by file extension. One map serves
 * two questions — whether a reference is a video, and what type to embed it as —
 * so that adding a format is a single line and neither answer can lag the other.
 */
export const MEDIA_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/** The extension of a reference, lowercased, with the query and hash dropped. */
export function mediaExtensionOf(reference: string): string {
  const path = reference.split(/[?#]/)[0] ?? "";
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot === -1 || dot < slash) {
    return "";
  }
  return path.slice(dot).toLowerCase();
}

/** The media type of a reference, or null when the extension is not one we carry. */
export function mediaTypeOf(reference: string): string | null {
  return MEDIA_MIME_TYPES[mediaExtensionOf(reference)] ?? null;
}

export function isVideoReference(reference: string): boolean {
  return mediaTypeOf(reference)?.startsWith("video/") === true;
}
