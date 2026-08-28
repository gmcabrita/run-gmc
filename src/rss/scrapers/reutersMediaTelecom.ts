import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import { createProxiedFetch } from "../../proxiedFetch";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  fallback,
  looseObject,
  nullish,
  optional,
  safeParse,
  string,
  unknown,
  type InferOutput,
} from "valibot";

const SITE_URL = "https://www.reuters.com";
const SECTION_PATH = "/business/media-telecom/";
const BASE_URL = new URL(SECTION_PATH, SITE_URL).href;
const API_URL =
  "https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-alias-or-id-v1";
const ACCEPT_LANGUAGE = "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7";
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

const OptionalTextSchema = fallback(nullish(string()), undefined);
const ReutersThumbnailSchema = looseObject({
  url: string(),
});
const ReutersArticlePayloadSchema = looseObject({
  basic_headline: OptionalTextSchema,
  canonical_url: OptionalTextSchema,
  description: OptionalTextSchema,
  id: string(),
  native: OptionalTextSchema,
  published_time: OptionalTextSchema,
  thumbnail: optional(unknown()),
  title: OptionalTextSchema,
  updated_time: OptionalTextSchema,
  web: OptionalTextSchema,
});
const ReutersApiPayloadSchema = looseObject({
  result: looseObject({
    articles: array(unknown()),
  }),
});

export type ReutersApiPayload = InferOutput<typeof ReutersApiPayloadSchema>;
type ReutersArticlePayload = InferOutput<typeof ReutersArticlePayloadSchema>;

interface ReutersArticle {
  canonicalUrl?: string;
  description?: string;
  id: string;
  imageUrl?: string;
  publishedAt?: string;
  title?: string;
}

interface ReutersSectionResponse {
  articles: Array<ReutersArticle>;
}

const EMPTY_REUTERS_PAYLOAD = { result: { articles: [] } } satisfies ReutersApiPayload;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  return (
    value
      ?.replaceAll('\u00A0', " ")
      .replaceAll(/\s+/g, " ")
      .trim() || undefined
  );
}

function parseReutersArticle(payload: ReutersArticlePayload): ReutersArticle | undefined {
  const id = normalizeOptionalText(payload.id);
  if (!id) {
    return undefined;
  }

  const thumbnailResult = safeParse(ReutersThumbnailSchema, payload.thumbnail);
  const title = normalizeText(
    normalizeOptionalText(payload.title) ??
      normalizeOptionalText(payload.basic_headline) ??
      normalizeOptionalText(payload.web) ??
      normalizeOptionalText(payload.native),
  );

  return {
    canonicalUrl: normalizeOptionalText(payload.canonical_url),
    description: normalizeText(normalizeOptionalText(payload.description)),
    id,
    imageUrl: thumbnailResult.success
      ? normalizeOptionalText(thumbnailResult.output.url)
      : undefined,
    publishedAt:
      normalizeOptionalText(payload.published_time) ??
      normalizeOptionalText(payload.updated_time),
    title,
  };
}

function readReutersResponse(payload: ReutersApiPayload): ReutersSectionResponse {
  const payloadResult = safeParse(ReutersApiPayloadSchema, payload);
  if (!payloadResult.success) {
    return { articles: [] };
  }

  return {
    articles: payloadResult.output.result.articles.flatMap((article) => {
      const articleResult = safeParse(ReutersArticlePayloadSchema, article);
      if (!articleResult.success) {
        return [];
      }

      const parsedArticle = parseReutersArticle(articleResult.output);
      return parsedArticle ? [parsedArticle] : [];
    }),
  };
}

function buildApiUrl() {
  const url = new URL(API_URL);
  url.searchParams.set("query", JSON.stringify(API_QUERY));
  url.searchParams.set("mxId", "00000000");
  url.searchParams.set("_website", "reuters");
  return url.toString();
}

export function parse(payload: ReutersApiPayload): RSSData {
  const response = readReutersResponse(payload);
  const entries: Array<RSSEntry> = response.articles
    .map((article) => {
      const link = article.canonicalUrl ? new URL(article.canonicalUrl, SITE_URL).href : "";
      const title = article.title ?? "";

      return {
        datetime: article.publishedAt ? new Date(article.publishedAt) : undefined,
        id: article.id,
        imageURL: article.imageUrl,
        link,
        text: article.description ?? title,
        title,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Reuters Media & Telecom news",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Reuters - Media & Telecom",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(_ctx.env)(buildApiUrl(), {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": ACCEPT_LANGUAGE,
      Referer: "https://www.reuters.com/business/media-telecom/",
    },
  });

  if (!response.ok) {
    throw new Error(`Reuters request failed: ${response.status}`);
  }

  const payloadResult = safeParse(ReutersApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_REUTERS_PAYLOAD);
}
