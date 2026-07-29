import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";

const BASE_URL = "https://www.wsj.com/business/media";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
const NEXT_DATA_PATTERN = /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getRecord(record: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function getArray(record: JsonRecord | undefined, key: string): unknown[] {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function getString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getCanonicalArticleUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.wsj.com") {
      return undefined;
    }

    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function parseDatetime(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const datetime = new Date(value);
  return Number.isNaN(datetime.getTime()) ? undefined : datetime;
}

function parseArticle(value: unknown): RSSEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const articleUrl = getString(value, "articleUrl");
  const headline = getString(value, "headline");
  if (!articleUrl || !headline) {
    return undefined;
  }

  const link = getCanonicalArticleUrl(articleUrl);
  if (!link) {
    return undefined;
  }

  const title = normalizeText(headline);
  const summary = getString(value, "summary");
  const imageURL = getString(value, "imageUrl");

  return {
    id: link,
    link,
    title,
    text: summary ? normalizeText(summary) : title,
    datetime: parseDatetime(getString(value, "timestamp")),
    imageURL,
  };
}

function readPageProps(html: string): JsonRecord {
  const payload = html.match(NEXT_DATA_PATTERN)?.[1];
  if (!payload) {
    throw new Error("Missing WSJ __NEXT_DATA__ payload");
  }

  const parsed: unknown = JSON.parse(payload);
  const props = getRecord(isRecord(parsed) ? parsed : undefined, "props");
  const result = getRecord(props, "pageProps");
  if (!result) {
    throw new Error("Invalid WSJ __NEXT_DATA__ payload");
  }

  return result;
}

export function parse(html: string): RSSData {
  const pageProps = readPageProps(html);
  const seenLinks = new Set<string>();
  const entries = [
    ...getArray(pageProps, "latestArticles"),
    ...getArray(pageProps, "moreInArticlesInitial"),
  ]
    .flatMap((value) => {
      const entry = parseArticle(value);
      if (!entry || seenLinks.has(entry.link)) {
        return [];
      }

      seenLinks.add(entry.link);
      return [entry];
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "WSJ - Business Media",
    description: "Media news and analysis from The Wall Street Journal",
    language: "en",
    entries,
  };
}

function getRequestHeaders(): HeadersInit {
  return {
    Cookie: 'bcookie=""',
    "Sec-CH-UA": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"macOS"',
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    "Accept-Language": "en-US,en;q=0.9",
    Priority: "u=0, i",
  };
}

export async function scrape(
  env: ProxiedFetchEnv,
  fetcher: typeof fetch = fetch,
): Promise<RSSData> {
  const response = await createProxiedFetch(env, fetcher)(BASE_URL, {
    headers: getRequestHeaders(),
  });

  if (!response.ok) {
    throw new Error(`WSJ request failed: ${response.status}`);
  }

  return parse(await response.text());
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return scrape(ctx.env);
}
