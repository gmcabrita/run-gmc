import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_URL = "https://www.bbc.co.uk";
const BASE_URL = "https://www.bbc.co.uk/mediacentre/latestnews";
const API_URL =
  "https://corporate.api.bbci.co.uk/api/search/ipages-live/_search?sort=originalDate:desc&q=projectId.keyword:ipages-media-centre%20AND%20(tags.id.keyword:Latest_News%20OR%20tags.fileId.keyword:Latest_News)&size=25&from=0";

interface BbcMediaCentreArticle {
  id: string;
  title?: string;
  description?: string;
  link?: string;
  imageUrl?: string;
  publishedAt?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  return value?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

function resolveUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return new URL(value, SITE_URL).href;
}

function resolveImageUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  if (value.startsWith("/")) {
    return new URL(value, SITE_URL).href;
  }

  return `https://${value}`;
}

function parseArticle(value: unknown): BbcMediaCentreArticle | undefined {
  if (!isRecord(value) || !isRecord(value._source)) {
    return undefined;
  }

  const source = value._source;
  const link = resolveUrl(readString(source.fullUrl) ?? readString(source.url));
  const id = readString(value._id) ?? link;

  if (!id) {
    return undefined;
  }

  return {
    id,
    title: normalizeText(readString(source.name)),
    description: normalizeText(readString(source.description)),
    link,
    imageUrl: resolveImageUrl(readString(source.imageUrl)),
    publishedAt: parseDate(readString(source.originalDate) ?? readString(source.modifiedDate)),
  };
}

function readArticles(value: unknown): BbcMediaCentreArticle[] {
  if (!isRecord(value) || !isRecord(value.hits) || !Array.isArray(value.hits.hits)) {
    return [];
  }

  return value.hits.hits.flatMap((article) => {
    const parsedArticle = parseArticle(article);
    return parsedArticle ? [parsedArticle] : [];
  });
}

export function parse(json: unknown): RSSData {
  const now = new Date();
  const entries: RSSEntry[] = readArticles(json)
    .filter((article) => !article.publishedAt || article.publishedAt <= now)
    .map((article) => {
      const title = article.title ?? "";

      return {
        id: article.id,
        link: article.link ?? "",
        title,
        text: article.description ?? title,
        datetime: article.publishedAt,
        imageURL: article.imageUrl,
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "BBC Media Centre - Latest News",
    description: "BBC Media Centre latest news",
    language: "en",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`BBC Media Centre request failed: ${response.status}`);
  }

  return parse(await response.json());
}
