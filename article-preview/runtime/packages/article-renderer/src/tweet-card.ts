import type { Parent, Root } from "hast";
import { isAutolinkedParagraph } from "./autolink.js";
import { buildTweetCard } from "./tweet-card-build.js";
import type { TweetData } from "./tweet-card-data.js";

const TWEET_URL_RE = /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;

export function extractTweetId(url: string): string | null {
  const match = url.match(TWEET_URL_RE);
  return match ? match[1] : null;
}

export { buildTweetCard } from "./tweet-card-build.js";
export type { QuotedTweetData, TweetData, TweetMedia } from "./tweet-card-data.js";

export type FetchTweet = (tweetId: string) => Promise<TweetData | null>;

export interface RehypeTweetCardOptions {
  fetchTweet: FetchTweet;
}

interface TweetCardTarget {
  parent: Parent;
  index: number;
  tweetId: string;
}

function collectTweetCardTargets(parent: Parent, targets: TweetCardTarget[]): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child?.type !== "element") {
      continue;
    }

    const url = isAutolinkedParagraph(child);
    const tweetId = url ? extractTweetId(url) : null;
    if (tweetId) {
      targets.push({ parent, index, tweetId });
      continue;
    }

    collectTweetCardTargets(child, targets);
  }
}

export function rehypeTweetCard(options: RehypeTweetCardOptions) {
  return async (tree: Root): Promise<void> => {
    const targets: TweetCardTarget[] = [];
    collectTweetCardTargets(tree, targets);

    const results = await Promise.all(targets.map(({ tweetId }) => options.fetchTweet(tweetId)));
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      const tweet = results[index];
      if (target && tweet) {
        target.parent.children[target.index] = buildTweetCard(tweet);
      }
    }
  };
}
