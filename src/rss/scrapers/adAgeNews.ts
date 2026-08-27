import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";
import { createProxiedFetch } from "../../proxiedFetch";

const BASE_URL = "https://adage.com/news/";
const SITE_ORIGIN = "https://adage.com";
const CONTENT_CACHE_PATTERN = /Fusion\.contentCache=(\{[\s\S]*?\});Fusion\./;

const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const JsonRecordSchema = v.record(v.string(), v.unknown());
const StoryFeedSectionSchema = v.looseObject({
  data: v.nullish(
    v.looseObject({
      content_elements: v.nullish(v.array(v.unknown())),
    }),
  ),
});
const AdAgeEntrySchema = v.looseObject({
  website_url: OptionalTextSchema,
  canonical_url: OptionalTextSchema,
  display_date: OptionalTextSchema,
  publish_date: OptionalTextSchema,
  first_publish_date: OptionalTextSchema,
  websites: v.fallback(
    v.nullish(
      v.looseObject({
        adage: v.fallback(
          v.nullish(
            v.looseObject({
              website_url: OptionalTextSchema,
            }),
          ),
          undefined,
        ),
      }),
    ),
    undefined,
  ),
  headlines: v.fallback(
    v.nullish(v.looseObject({ basic: OptionalTextSchema })),
    undefined,
  ),
  description: v.fallback(
    v.nullish(v.looseObject({ basic: OptionalTextSchema })),
    undefined,
  ),
  promo_items: v.fallback(
    v.nullish(
      v.looseObject({
        basic: v.fallback(
          v.nullish(v.looseObject({ url: OptionalTextSchema })),
          undefined,
        ),
      }),
    ),
    undefined,
  ),
});

type AdAgeContentCache = v.InferOutput<typeof JsonRecordSchema>;
type AdAgeEntry = v.InferOutput<typeof AdAgeEntrySchema>;

function getEntries(cache: AdAgeContentCache): AdAgeEntry[] {
  const sectionsResult = v.safeParse(JsonRecordSchema, cache["story-feed-sections"]);
  if (!sectionsResult.success) {
    return [];
  }

  return Object.values(sectionsResult.output).flatMap((section) => {
    const sectionResult = v.safeParse(StoryFeedSectionSchema, section);
    if (!sectionResult.success) {
      return [];
    }

    return (sectionResult.output.data?.content_elements ?? []).flatMap((entry) => {
      const entryResult = v.safeParse(AdAgeEntrySchema, entry);
      return entryResult.success ? [entryResult.output] : [];
    });
  });
}

function getEntryLink(entry: AdAgeEntry): string | undefined {
  const path =
    entry.website_url ?? entry.websites?.adage?.website_url ?? entry.canonical_url;

  if (!path || path.trim() === "") {
    return undefined;
  }

  return new URL(path, SITE_ORIGIN).toString();
}

function getEntryTitle(entry: AdAgeEntry): string | undefined {
  return entry.headlines?.basic?.trim() || undefined;
}

function getEntryText(entry: AdAgeEntry, title: string): string {
  const description = entry.description?.basic?.trim();
  return description && description !== "" ? description : title;
}

function getEntryImageURL(entry: AdAgeEntry): string | undefined {
  return entry.promo_items?.basic?.url?.trim() || undefined;
}

function parseEntryDate(entry: AdAgeEntry): Date | undefined {
  const rawDate = entry.display_date ?? entry.publish_date ?? entry.first_publish_date;
  if (!rawDate) {
    return undefined;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseContentCache(html: string): AdAgeContentCache {
  const match = html.match(CONTENT_CACHE_PATTERN);
  const contentCache = match?.[1];
  if (!contentCache) {
    throw new Error("Missing Fusion.contentCache payload");
  }

  const result = v.safeParse(JsonRecordSchema, JSON.parse(contentCache));
  if (!result.success) {
    throw new Error("Invalid Fusion.contentCache payload");
  }

  return result.output;
}

export async function parse(response: Response, now: Date = new Date()): Promise<RSSData> {
  const html = await response.text();
  const contentCache = parseContentCache(html);

  const entries: RSSEntry[] = getEntries(contentCache)
    .flatMap((entry) => {
      const link = getEntryLink(entry);
      const title = getEntryTitle(entry);
      const datetime = parseEntryDate(entry);

      if (!link || !title || (datetime && datetime > now)) {
        return [];
      }

      return [
        {
          id: link,
          link,
          title,
          text: getEntryText(entry, title),
          datetime,
          imageURL: getEntryImageURL(entry),
        },
      ];
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Latest News - Ad Age",
    description: "Latest News",
    language: "en",
    entries,
  };
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(ctx.env)(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
      accept: "text/html",
    },
  });

  return parse(response);
}
