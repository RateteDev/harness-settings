import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FETCH_TIMEOUT_MS } from "./fetch-constants";
import type { QuotedTweetData, TweetData, TweetMedia } from "./tweet-card-data.js";

export type { QuotedTweetData, TweetData, TweetMedia } from "./tweet-card-data.js";

const SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";
const FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

const projectRoot = dirname(fileURLToPath(new URL("../../", import.meta.url)));
const CACHE_DIR = join(projectRoot, "node_modules", ".cache", "tweet-card");

function cacheKey(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

function cachePath(id: string): string {
  return join(CACHE_DIR, `${cacheKey(id)}.json`);
}

function readCache(id: string): TweetData | null {
  const file = cachePath(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as TweetData;
  } catch {
    return null;
  }
}

function writeCache(id: string, data: TweetData): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(id), JSON.stringify(data));
}

function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function processText(raw: Record<string, unknown>): string {
  let text = (raw.text as string) ?? "";
  text = decodeHtmlEntities(text);

  const urls =
    ((raw.entities as Record<string, unknown>)?.urls as Array<{
      url: string;
      display_url: string;
    }>) ?? [];
  for (const u of urls) {
    text = text.replace(u.url, u.display_url);
  }

  const mediaEntities =
    ((raw.entities as Record<string, unknown>)?.media as Array<{
      url: string;
    }>) ?? [];
  for (const m of mediaEntities) {
    text = text.replace(m.url, "");
  }

  return text.trim();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const h = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

function extractMedia(json: Record<string, unknown>): TweetMedia[] | null {
  const mediaDetails = (json.mediaDetails as Array<Record<string, unknown>>) ?? [];
  const media = mediaDetails.map((m) => ({
    type: m.type as TweetMedia["type"],
    url: m.media_url_https as string,
    width: ((m.original_info as Record<string, unknown>)?.width as number) ?? 0,
    height: ((m.original_info as Record<string, unknown>)?.height as number) ?? 0,
    altText: (m.ext_alt_text as string) ?? null,
  }));
  return media.length > 0 ? media : null;
}

function parseQuotedTweet(json: Record<string, unknown>): QuotedTweetData | null {
  const qt = json.quoted_tweet as Record<string, unknown> | undefined;
  if (!qt?.user) return null;

  const user = qt.user as Record<string, unknown>;
  const id = (qt.id_str as string) ?? "";

  return {
    id,
    text: processText(qt),
    authorName: user.name as string,
    authorHandle: user.screen_name as string,
    authorAvatarUrl: user.profile_image_url_https as string,
    isVerified: (user.is_blue_verified as boolean) ?? false,
    media: extractMedia(qt),
    permalink: `https://x.com/${user.screen_name as string}/status/${id}`,
  };
}

export async function fetchTweet(tweetId: string): Promise<TweetData | null> {
  const cached = readCache(tweetId);
  if (cached) return cached;

  try {
    const url = new URL(SYNDICATION_URL);
    url.searchParams.set("id", tweetId);
    url.searchParams.set("lang", "ja");
    url.searchParams.set("features", FEATURES);
    url.searchParams.set("token", getToken(tweetId));

    const res = await fetch(url.href, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "bot" },
    });

    if (!res.ok) {
      console.warn(`[tweet-card] fetch failed for tweet ${tweetId}: HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as Record<string, unknown>;

    if (!json || json.__typename === "TweetTombstone" || !(json.user as Record<string, unknown>)) {
      return null;
    }

    const user = json.user as Record<string, unknown>;
    const id = (json.id_str as string) ?? tweetId;

    const data: TweetData = {
      id,
      text: processText(json),
      authorName: user.name as string,
      authorHandle: user.screen_name as string,
      authorAvatarUrl: user.profile_image_url_https as string,
      isVerified: (user.is_blue_verified as boolean) ?? false,
      createdAt: formatDate(json.created_at as string),
      favoriteCount: (json.favorite_count as number) ?? 0,
      conversationCount: (json.conversation_count as number) ?? 0,
      inReplyToHandle: (json.in_reply_to_screen_name as string) ?? null,
      media: extractMedia(json),
      quotedTweet: parseQuotedTweet(json),
      permalink: `https://x.com/${user.screen_name as string}/status/${id}`,
    };

    writeCache(tweetId, data);
    return data;
  } catch (e) {
    console.warn(`[tweet-card] fetch failed for tweet ${tweetId}:`, e);
    return null;
  }
}
