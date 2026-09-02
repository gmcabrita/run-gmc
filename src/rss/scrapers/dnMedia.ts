import { USERAGENT, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  boolean,
  fallback,
  looseObject,
  nullish,
  number,
  safeParse,
  string,
  unknown,
  type InferOutput,
} from "valibot";

const SITE_ORIGIN = "https://www.dn.pt";
const BASE_URL = `${SITE_ORIGIN}/media-geral`;
const ASSET_ORIGIN = "https://media.assettype.com";
const API_URL =
  "https://www.dn.pt/api/v1/collections/media-geral?item-type=story&offset=0&limit=20";

const OptionalTextSchema = fallback(nullish(string()), undefined);
const OptionalTimestampSchema = fallback(nullish(number()), undefined);
const DnStorySchema = looseObject({
  "first-published-at": OptionalTimestampSchema,
  headline: OptionalTextSchema,
  "hero-image-s3-key": OptionalTextSchema,
  id: OptionalTextSchema,
  // Invalid embargo values reject the story so restricted content fails closed.
  "is-embargoed": nullish(boolean()),
  "published-at": OptionalTimestampSchema,
  slug: OptionalTextSchema,
  subheadline: OptionalTextSchema,
  summary: OptionalTextSchema,
  "updated-at": OptionalTimestampSchema,
  url: OptionalTextSchema,
});
const DnCollectionItemSchema = looseObject({
  id: OptionalTextSchema,
  story: unknown(),
});
const DnApiPayloadSchema = looseObject({
  items: array(unknown()),
});

export type DnApiPayload = InferOutput<typeof DnApiPayloadSchema>;
type DnStory = InferOutput<typeof DnStorySchema>;

const EMPTY_DN_PAYLOAD = { items: [] } satisfies DnApiPayload;

function normalizeText(value: string | null | undefined): string | undefined {
  return value?.replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim() || undefined;
}

function normalizeToken(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

function resolveStoryUrl(story: DnStory): string | undefined {
  const value = normalizeToken(story.url) ?? normalizeToken(story.slug);
  if (!value || !URL.canParse(value, SITE_ORIGIN)) {
    return undefined;
  }

  const url = new URL(value, SITE_ORIGIN);
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
}

function resolveImageUrl(value: string | null | undefined): string | undefined {
  const key = normalizeToken(value);
  if (!key || !URL.canParse(key, ASSET_ORIGIN)) {
    return undefined;
  }

  const url = new URL(key, ASSET_ORIGIN);
  return url.origin === ASSET_ORIGIN ? url.href : undefined;
}

function parseTimestamp(value: number | null | undefined): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseStory(story: DnStory, collectionItemId?: string | null): RSSEntry | undefined {
  if (story["is-embargoed"] === true) {
    return undefined;
  }

  const link = resolveStoryUrl(story);
  const title = normalizeText(story.headline);
  if (!link || !title) {
    return undefined;
  }

  return {
    datetime:
      parseTimestamp(story["published-at"]) ??
      parseTimestamp(story["first-published-at"]) ??
      parseTimestamp(story["updated-at"]),
    id: normalizeToken(story.id) ?? normalizeToken(collectionItemId) ?? link,
    imageURL: resolveImageUrl(story["hero-image-s3-key"]),
    link,
    text: normalizeText(story.subheadline) ?? normalizeText(story.summary) ?? title,
    title,
  };
}

export function parse(payload: DnApiPayload): RSSData {
  const entries = payload.items.flatMap((item) => {
    const itemResult = safeParse(DnCollectionItemSchema, item);
    if (!itemResult.success) {
      return [];
    }

    const storyResult = safeParse(DnStorySchema, itemResult.output.story);
    if (!storyResult.success) {
      return [];
    }

    const entry = parseStory(storyResult.output, itemResult.output.id);
    return entry ? [entry] : [];
  });

  return {
    description: "Diário de Notícias Media",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Diário de Notícias - Media",
  };
}

export async function scrapeMediaApi(fetchFn: typeof fetch): Promise<RSSData> {
  const response = await fetchFn(API_URL, {
    headers: {
      accept: "application/json, text/plain, */*",
      Referer: BASE_URL,
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`DN media request failed: ${response.status}`);
  }

  const payloadResult = safeParse(DnApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_DN_PAYLOAD);
}

export async function get(_ctx: ScraperContext, fetchFn: typeof fetch = fetch): Promise<RSSData> {
  return scrapeMediaApi(fetchFn);
}
