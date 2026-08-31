import type { Element, ElementContent, Parent, Root } from "hast";
import { isAutolinkedParagraph } from "./autolink.js";
import type { OgpData } from "./url-card-ogp.js";

export type FetchOgp = (url: string) => Promise<OgpData>;

export interface RehypeUrlCardOptions {
  fetchOgp: FetchOgp;
}

export function buildUrlCard(url: string, ogp: OgpData): Element {
  const displayUrl = (() => {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`.replace(
        /\/$/,
        "",
      );
    } catch {
      return url;
    }
  })();

  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const faviconSrc = ogp.favicon ?? `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  const bodyChildren: ElementContent[] = [
    {
      type: "element",
      tagName: "span",
      properties: { className: ["url-card__title"] },
      children: [{ type: "text", value: ogp.title ?? displayUrl }],
    },
  ];

  if (ogp.description) {
    bodyChildren.push({
      type: "element",
      tagName: "span",
      properties: { className: ["url-card__desc"] },
      children: [{ type: "text", value: ogp.description }],
    });
  }

  bodyChildren.push({
    type: "element",
    tagName: "span",
    properties: { className: ["url-card__url"] },
    children: [{ type: "text", value: displayUrl }],
  });

  return {
    type: "element",
    tagName: "a",
    properties: {
      className: ["url-card"],
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    children: [
      {
        type: "element",
        tagName: "img",
        properties: {
          className: ["url-card__favicon"],
          src: faviconSrc,
          alt: "",
          width: "20",
          height: "20",
          loading: "lazy",
        },
        children: [],
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["url-card__body"] },
        children: bodyChildren,
      },
    ],
  };
}

interface UrlCardTarget {
  parent: Parent;
  index: number;
  url: string;
}

function collectUrlCardTargets(parent: Parent, targets: UrlCardTarget[]): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child?.type !== "element") {
      continue;
    }

    const url = isAutolinkedParagraph(child);
    if (url) {
      targets.push({ parent, index, url });
      continue;
    }

    collectUrlCardTargets(child, targets);
  }
}

export function rehypeUrlCard(options: RehypeUrlCardOptions) {
  return async (tree: Root): Promise<void> => {
    const targets: UrlCardTarget[] = [];
    collectUrlCardTargets(tree, targets);

    const results = await Promise.all(targets.map(({ url }) => options.fetchOgp(url)));
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      const ogp = results[index];
      if (target && ogp) {
        target.parent.children[target.index] = buildUrlCard(target.url, ogp);
      }
    }
  };
}
