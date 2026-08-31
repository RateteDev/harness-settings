/**
 * Fetch OGP metadata for a URL with file-based caching.
 * Cache lives in node_modules/.cache/url-card-ogp/ (gitignored, survives
 * between builds, cleared on `bun install`).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FETCH_TIMEOUT_MS } from "./fetch-constants";

export interface OgpData {
  title: string | null;
  description: string | null;
  favicon: string | null;
}

const packageRoot = dirname(fileURLToPath(new URL("../", import.meta.url)));
const CACHE_DIR = join(packageRoot, "node_modules", ".cache", "url-card-ogp");

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function readCache(url: string): OgpData | null {
  const file = join(CACHE_DIR, `${cacheKey(url)}.json`);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    return { title: raw.title, description: raw.description, favicon: raw.favicon };
  } catch {
    return null;
  }
}

function writeCache(url: string, data: OgpData): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${cacheKey(url)}.json`);
  writeFileSync(file, JSON.stringify({ ...data, _url: url, _ts: Date.now() }));
}

function extractMeta(html: string, url: string): OgpData {
  const og = (name: string): string | null => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*?)["']`,
      "i",
    );
    const match = html.match(re);
    if (match) return match[1];
    const reAlt = new RegExp(
      `<meta[^>]+content=["']([^"']*?)["'][^>]+(?:property|name)=["']${name}["']`,
      "i",
    );
    const matchAlt = html.match(reAlt);
    return matchAlt?.[1] ?? null;
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = og("og:title") ?? titleMatch?.[1]?.trim() ?? null;
  const description = og("og:description") ?? og("description") ?? null;

  let favicon: string | null = null;
  const iconMatch = html.match(
    /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
  );
  const iconMatchAlt = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i,
  );
  const rawIcon = iconMatch?.[1] ?? iconMatchAlt?.[1] ?? null;

  if (rawIcon) {
    try {
      favicon = new URL(rawIcon, url).href;
    } catch {
      favicon = rawIcon;
    }
  }

  return { title, description, favicon };
}

export async function fetchOgp(url: string): Promise<OgpData> {
  const cached = readCache(url);
  if (cached) return cached;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "bot" },
    });
    if (!res.ok) {
      const fallback: OgpData = { title: null, description: null, favicon: null };
      writeCache(url, fallback);
      return fallback;
    }
    const html = await res.text();
    const data = extractMeta(html, url);
    writeCache(url, data);
    return data;
  } catch {
    const fallback: OgpData = { title: null, description: null, favicon: null };
    writeCache(url, fallback);
    return fallback;
  }
}
