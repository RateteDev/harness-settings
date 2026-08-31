import type { Element, ElementContent } from "hast";
import {
  formatCount,
  type QuotedTweetData,
  type TweetData,
  type TweetMedia,
} from "./tweet-card-data.js";
import { heartIcon, playIcon, replyIcon, verifiedBadge } from "./tweet-card-icons.js";

function buildMediaGrid(media: TweetMedia[]): Element {
  const count = media.length;
  const gridClass =
    count === 1
      ? "tweet-card__media--single"
      : count === 2
        ? "tweet-card__media--double"
        : count === 3
          ? "tweet-card__media--triple"
          : "tweet-card__media--quad";

  const children: ElementContent[] = media.map((m) => {
    const img: Element = {
      type: "element",
      tagName: "img",
      properties: {
        src: m.url,
        alt: m.altText ?? "",
        width: String(m.width),
        height: String(m.height),
        loading: "lazy",
      },
      children: [],
    };

    if (m.type === "video" || m.type === "animated_gif") {
      return {
        type: "element",
        tagName: "div",
        properties: { className: ["tweet-card__media-item", "tweet-card__media-video"] },
        children: [img, playIcon()],
      };
    }

    return {
      type: "element",
      tagName: "div",
      properties: { className: ["tweet-card__media-item"] },
      children: [img],
    };
  });

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__media", gridClass] },
    children,
  };
}

function buildQuotedTweet(qt: QuotedTweetData): Element {
  const avatar: Element = {
    type: "element",
    tagName: "img",
    properties: {
      className: ["tweet-card__quote-avatar"],
      src: qt.authorAvatarUrl,
      alt: "",
      width: "20",
      height: "20",
      loading: "lazy",
    },
    children: [],
  };

  const nameChildren: ElementContent[] = [{ type: "text", value: qt.authorName }];
  if (qt.isVerified) {
    nameChildren.push(verifiedBadge());
  }

  const header: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__quote-header"] },
    children: [
      avatar,
      {
        type: "element",
        tagName: "span",
        properties: { className: ["tweet-card__quote-name"] },
        children: nameChildren,
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["tweet-card__quote-handle"] },
        children: [{ type: "text", value: `@${qt.authorHandle}` }],
      },
    ],
  };

  const textEl: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__quote-text"] },
    children: [{ type: "text", value: qt.text }],
  };

  const children: ElementContent[] = [header, textEl];

  if (qt.media && qt.media.length > 0) {
    children.push(buildMediaGrid(qt.media));
  }

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__quote"] },
    children,
  };
}

export function buildTweetCard(tweet: TweetData): Element {
  const avatar: Element = {
    type: "element",
    tagName: "img",
    properties: {
      className: ["tweet-card__avatar"],
      src: tweet.authorAvatarUrl,
      alt: "",
      width: "40",
      height: "40",
      loading: "lazy",
    },
    children: [],
  };

  const nameChildren: ElementContent[] = [{ type: "text", value: tweet.authorName }];
  if (tweet.isVerified) {
    nameChildren.push(verifiedBadge());
  }

  const nameEl: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["tweet-card__name"] },
    children: nameChildren,
  };

  const handleEl: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["tweet-card__handle"] },
    children: [{ type: "text", value: `@${tweet.authorHandle}` }],
  };

  const authorEl: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__author"] },
    children: [nameEl, handleEl],
  };

  const header: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__header"] },
    children: [avatar, authorEl],
  };

  const cardChildren: ElementContent[] = [];

  if (tweet.inReplyToHandle) {
    cardChildren.push({
      type: "element",
      tagName: "span",
      properties: { className: ["tweet-card__reply-to"] },
      children: [
        { type: "text", value: `@${tweet.inReplyToHandle}` },
        { type: "text", value: "に返信" },
      ],
    });
  }

  const textEl: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__text"] },
    children: [{ type: "text", value: tweet.text }],
  };

  const bodyChildren: ElementContent[] = [textEl];

  if (tweet.media && tweet.media.length > 0) {
    bodyChildren.push(buildMediaGrid(tweet.media));
  }

  if (tweet.quotedTweet) {
    bodyChildren.push(buildQuotedTweet(tweet.quotedTweet));
  }

  const body: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__body"] },
    children: bodyChildren,
  };

  const dateEl: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["tweet-card__date"] },
    children: [{ type: "text", value: tweet.createdAt }],
  };

  const likeEl: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["tweet-card__stat", "tweet-card__stat--like"] },
    children: [heartIcon(), { type: "text", value: formatCount(tweet.favoriteCount) }],
  };

  const replyEl: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["tweet-card__stat", "tweet-card__stat--reply"] },
    children: [replyIcon(), { type: "text", value: formatCount(tweet.conversationCount) }],
  };

  const footer: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["tweet-card__footer"] },
    children: [dateEl, likeEl, replyEl],
  };

  cardChildren.push(header, body, footer);

  return {
    type: "element",
    tagName: "a",
    properties: {
      className: ["tweet-card"],
      href: tweet.permalink,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    children: cardChildren,
  };
}
