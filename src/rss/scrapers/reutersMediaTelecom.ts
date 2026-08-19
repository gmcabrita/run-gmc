import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import { createProxiedFetch } from "../../proxiedFetch";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

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

const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const ReutersThumbnailSchema = v.looseObject({
  url: v.string(),
});
const ReutersArticlePayloadSchema = v.looseObject({
  id: v.string(),
  canonical_url: OptionalTextSchema,
  title: OptionalTextSchema,
  basic_headline: OptionalTextSchema,
  web: OptionalTextSchema,
  native: OptionalTextSchema,
  description: OptionalTextSchema,
  published_time: OptionalTextSchema,
  updated_time: OptionalTextSchema,
  thumbnail: v.optional(v.unknown()),
});
const ReutersApiPayloadSchema = v.looseObject({
  result: v.looseObject({
    articles: v.array(v.unknown()),
  }),
});

export type ReutersApiPayload = v.InferOutput<typeof ReutersApiPayloadSchema>;
type ReutersArticlePayload = v.InferOutput<typeof ReutersArticlePayloadSchema>;

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

const EMPTY_REUTERS_PAYLOAD = { result: { articles: [] } } satisfies ReutersApiPayload;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  return (
    value
      ?.replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim() || undefined
  );
}

function parseReutersArticle(payload: ReutersArticlePayload): ReutersArticle | undefined {
  const id = normalizeOptionalText(payload.id);
  if (!id) {
    return undefined;
  }

  const thumbnailResult = v.safeParse(ReutersThumbnailSchema, payload.thumbnail);
  const title = normalizeText(
    normalizeOptionalText(payload.title) ??
      normalizeOptionalText(payload.basic_headline) ??
      normalizeOptionalText(payload.web) ??
      normalizeOptionalText(payload.native),
  );

  return {
    id,
    canonicalUrl: normalizeOptionalText(payload.canonical_url),
    title,
    description: normalizeText(normalizeOptionalText(payload.description)),
    publishedAt:
      normalizeOptionalText(payload.published_time) ??
      normalizeOptionalText(payload.updated_time),
    imageUrl: thumbnailResult.success
      ? normalizeOptionalText(thumbnailResult.output.url)
      : undefined,
  };
}

function readReutersResponse(payload: ReutersApiPayload): ReutersSectionResponse {
  const payloadResult = v.safeParse(ReutersApiPayloadSchema, payload);
  if (!payloadResult.success) {
    return { articles: [] };
  }

  return {
    articles: payloadResult.output.result.articles.flatMap((article) => {
      const articleResult = v.safeParse(ReutersArticlePayloadSchema, article);
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
  const response = await createProxiedFetch(_ctx.env)(buildApiUrl(), {
    headers: {
      Referer: "https://www.reuters.com/business/media-telecom/",
      accept: "application/json, text/plain, */*",
      "accept-language": ACCEPT_LANGUAGE,
    },
  });

  if (!response.ok) {
    throw new Error(`Reuters request failed: ${response.status}`);
  }

  const payloadResult = v.safeParse(ReutersApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_REUTERS_PAYLOAD);
}
