import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_URL = "https://www.reuters.com";
const SECTION_PATH = "/business/media-telecom/";
const BASE_URL = new URL(SECTION_PATH, SITE_URL).href;
const API_URL =
  "https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-alias-or-id-v1";
const ACCEPT_LANGUAGE = "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7";
const REQUEST_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const API_QUERY = {
  "arc-site": "reuters",
  fetch_type: "collection",
  offset: 0,
  requestId: 1,
  section_id: SECTION_PATH,
  size: "20",
  uri: SECTION_PATH,
  website: "reuters",
};

interface ReutersArticle {
  id: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  publishedAt?: string;
  imageUrl?: string;
}

interface ReutersSectionResponse {
  articles: ReutersArticle[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  return (
    value
      ?.replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim() || undefined
  );
}

function parseReutersArticle(value: unknown): ReutersArticle | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value.id);
  if (!id) {
    return undefined;
  }

  const thumbnail = isRecord(value.thumbnail) ? readString(value.thumbnail.url) : undefined;
  const title = normalizeText(
    readString(value.title) ??
      readString(value.basic_headline) ??
      readString(value.web) ??
      readString(value.native),
  );

  return {
    id,
    canonicalUrl: readString(value.canonical_url),
    title,
    description: normalizeText(readString(value.description)),
    publishedAt: readString(value.published_time) ?? readString(value.updated_time),
    imageUrl: thumbnail,
  };
}

function readReutersResponse(value: unknown): ReutersSectionResponse {
  if (!isRecord(value) || !isRecord(value.result) || !Array.isArray(value.result.articles)) {
    return { articles: [] };
  }

  return {
    articles: value.result.articles.flatMap((article) => {
      const parsedArticle = parseReutersArticle(article);
      return parsedArticle ? [parsedArticle] : [];
    }),
  };
}

function buildApiUrl() {
  const url = new URL(API_URL);
  url.searchParams.set("query", JSON.stringify(API_QUERY));
  // url.searchParams.set("d", "359");
  url.searchParams.set("mxId", "00000000");
  url.searchParams.set("_website", "reuters");
  return url.toString();
}

export function parse(json: unknown): RSSData {
  const response = readReutersResponse(json);
  const entries: RSSEntry[] = response.articles
    .map((article) => {
      const link = article.canonicalUrl ? new URL(article.canonicalUrl, SITE_URL).href : "";
      const title = article.title ?? "";

      return {
        id: article.id,
        link,
        title,
        text: article.description ?? title,
        datetime: article.publishedAt ? new Date(article.publishedAt) : undefined,
        imageURL: article.imageUrl,
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Reuters - Media & Telecom",
    description: "Reuters Media & Telecom news",
    language: "en",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(buildApiUrl(), {
    headers: {
      referrer: "https://www.reuters.com/business/media-telecom/",
      accept: "application/json, text/plain, */*",
      "accept-language": ACCEPT_LANGUAGE,
      "user-agent": REQUEST_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Reuters request failed: ${response.status}`);
  }

  return parse(await response.json());
}
