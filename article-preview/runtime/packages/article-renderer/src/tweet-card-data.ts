export interface TweetMedia {
  type: "photo" | "video" | "animated_gif";
  url: string;
  width: number;
  height: number;
  altText: string | null;
}

export interface QuotedTweetData {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string;
  isVerified: boolean;
  media: TweetMedia[] | null;
  permalink: string;
}

export interface TweetData {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string;
  isVerified: boolean;
  createdAt: string;
  favoriteCount: number;
  conversationCount: number;
  inReplyToHandle: string | null;
  media: TweetMedia[] | null;
  quotedTweet: QuotedTweetData | null;
  permalink: string;
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}
