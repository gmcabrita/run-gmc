import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  fallback,
  looseObject,
  nullish,
  safeParse,
  string,
  unknown,
  type InferOutput,
} from "valibot";

const SITE_URL = "https://www.bbc.co.uk";
const BASE_URL = "https://www.bbc.co.uk/mediacentre/latestnews";
const API_URL =
  "https://corporate.api.bbci.co.uk/api/search/ipages-live/_search?sort=originalDate:desc&q=projectId.keyword:ipages-media-centre%20AND%20(tags.id.keyword:Latest_News%20OR%20tags.fileId.keyword:Latest_News)&size=25&from=0";

const OptionalTextSchema = fallback(nullish(string()), undefined);
const BbcArticlePayloadSchema = looseObject({
  _id: OptionalTextSchema,
  _source: looseObject({
    description: OptionalTextSchema,
    fullUrl: OptionalTextSchema,
    imageUrl: OptionalTextSchema,
    modifiedDate: OptionalTextSchema,
    name: OptionalTextSchema,
    originalDate: OptionalTextSchema,
    url: OptionalTextSchema,
  }),
});
const BbcApiPayloadSchema = looseObject({
  hits: looseObject({
    hits: array(unknown()),
  }),
});

export type BbcApiPayload = InferOutput<typeof BbcApiPayloadSchema>;
type BbcArticlePayload = InferOutput<typeof BbcArticlePayloadSchema>;

interface BbcMediaCentreArticle {
  description?: string;
  id: string;
  imageUrl?: string;
  link?: string;
  publishedAt?: Date;
  title?: string;
}

const EMPTY_BBC_PAYLOAD = { hits: { hits: [] } } satisfies BbcApiPayload;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  return value?.replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim() || undefined;
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

function parseArticle(payload: BbcArticlePayload): BbcMediaCentreArticle | undefined {
  const source = payload._source;
  const link = resolveUrl(
    normalizeOptionalText(source.fullUrl) ?? normalizeOptionalText(source.url),
  );
  const id = normalizeOptionalText(payload._id) ?? link;

  if (!id) {
    return undefined;
  }

  return {
    description: normalizeText(normalizeOptionalText(source.description)),
    id,
    imageUrl: resolveImageUrl(normalizeOptionalText(source.imageUrl)),
    link,
    publishedAt: parseDate(
      normalizeOptionalText(source.originalDate) ?? normalizeOptionalText(source.modifiedDate),
    ),
    title: normalizeText(normalizeOptionalText(source.name)),
  };
}

function readArticles(payload: BbcApiPayload): Array<BbcMediaCentreArticle> {
  const payloadResult = safeParse(BbcApiPayloadSchema, payload);
  if (!payloadResult.success) {
    return [];
  }

  return payloadResult.output.hits.hits.flatMap((article) => {
    const articleResult = safeParse(BbcArticlePayloadSchema, article);
    if (!articleResult.success) {
      return [];
    }

    const parsedArticle = parseArticle(articleResult.output);
    return parsedArticle ? [parsedArticle] : [];
  });
}

export function parse(payload: BbcApiPayload): RSSData {
  const now = new Date();
  const entries: Array<RSSEntry> = readArticles(payload)
    .filter((article) => !article.publishedAt || article.publishedAt <= now)
    .map((article) => {
      const title = article.title ?? "";

      return {
        datetime: article.publishedAt,
        id: article.id,
        imageURL: article.imageUrl,
        link: article.link ?? "",
        text: article.description ?? title,
        title,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "BBC Media Centre latest news",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "BBC Media Centre - Latest News",
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

  const payloadResult = safeParse(BbcApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_BBC_PAYLOAD);
}
