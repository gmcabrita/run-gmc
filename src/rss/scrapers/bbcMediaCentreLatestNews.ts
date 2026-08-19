import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const SITE_URL = "https://www.bbc.co.uk";
const BASE_URL = "https://www.bbc.co.uk/mediacentre/latestnews";
const API_URL =
  "https://corporate.api.bbci.co.uk/api/search/ipages-live/_search?sort=originalDate:desc&q=projectId.keyword:ipages-media-centre%20AND%20(tags.id.keyword:Latest_News%20OR%20tags.fileId.keyword:Latest_News)&size=25&from=0";

const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const BbcArticlePayloadSchema = v.looseObject({
  _id: OptionalTextSchema,
  _source: v.looseObject({
    fullUrl: OptionalTextSchema,
    url: OptionalTextSchema,
    name: OptionalTextSchema,
    description: OptionalTextSchema,
    imageUrl: OptionalTextSchema,
    originalDate: OptionalTextSchema,
    modifiedDate: OptionalTextSchema,
  }),
});
const BbcApiPayloadSchema = v.looseObject({
  hits: v.looseObject({
    hits: v.array(v.unknown()),
  }),
});

export type BbcApiPayload = v.InferOutput<typeof BbcApiPayloadSchema>;
type BbcArticlePayload = v.InferOutput<typeof BbcArticlePayloadSchema>;

interface BbcMediaCentreArticle {
  id: string;
  title?: string;
  description?: string;
  link?: string;
  imageUrl?: string;
  publishedAt?: Date;
}

const EMPTY_BBC_PAYLOAD = { hits: { hits: [] } } satisfies BbcApiPayload;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
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
    id,
    title: normalizeText(normalizeOptionalText(source.name)),
    description: normalizeText(normalizeOptionalText(source.description)),
    link,
    imageUrl: resolveImageUrl(normalizeOptionalText(source.imageUrl)),
    publishedAt: parseDate(
      normalizeOptionalText(source.originalDate) ?? normalizeOptionalText(source.modifiedDate),
    ),
  };
}

function readArticles(payload: BbcApiPayload): BbcMediaCentreArticle[] {
  const payloadResult = v.safeParse(BbcApiPayloadSchema, payload);
  if (!payloadResult.success) {
    return [];
  }

  return payloadResult.output.hits.hits.flatMap((article) => {
    const articleResult = v.safeParse(BbcArticlePayloadSchema, article);
    if (!articleResult.success) {
      return [];
    }

    const parsedArticle = parseArticle(articleResult.output);
    return parsedArticle ? [parsedArticle] : [];
  });
}

export function parse(payload: BbcApiPayload): RSSData {
  const now = new Date();
  const entries: RSSEntry[] = readArticles(payload)
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

  const payloadResult = v.safeParse(BbcApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_BBC_PAYLOAD);
}
