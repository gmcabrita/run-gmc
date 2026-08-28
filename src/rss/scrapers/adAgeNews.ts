import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  fallback,
  looseObject,
  nullish,
  record,
  safeParse,
  string,
  unknown,
  type InferOutput,
} from "valibot";
import { createProxiedFetch } from "../../proxiedFetch";

const BASE_URL = "https://adage.com/news/";
const SITE_ORIGIN = "https://adage.com";
const CONTENT_CACHE_PATTERN = /Fusion\.contentCache=(\{[\s\S]*?\});Fusion\./;

const OptionalTextSchema = fallback(nullish(string()), undefined);
const JsonRecordSchema = record(string(), unknown());
const StoryFeedSectionSchema = looseObject({
  data: nullish(
    looseObject({
      content_elements: nullish(array(unknown())),
    }),
  ),
});
const AdAgeEntrySchema = looseObject({
  canonical_url: OptionalTextSchema,
  description: fallback(nullish(looseObject({ basic: OptionalTextSchema })), undefined),
  display_date: OptionalTextSchema,
  first_publish_date: OptionalTextSchema,
  headlines: fallback(nullish(looseObject({ basic: OptionalTextSchema })), undefined),
  promo_items: fallback(
    nullish(
      looseObject({
        basic: fallback(nullish(looseObject({ url: OptionalTextSchema })), undefined),
      }),
    ),
    undefined,
  ),
  publish_date: OptionalTextSchema,
  website_url: OptionalTextSchema,
  websites: fallback(
    nullish(
      looseObject({
        adage: fallback(
          nullish(
            looseObject({
              website_url: OptionalTextSchema,
            }),
          ),
          undefined,
        ),
      }),
    ),
    undefined,
  ),
});

type AdAgeContentCache = InferOutput<typeof JsonRecordSchema>;
type AdAgeEntry = InferOutput<typeof AdAgeEntrySchema>;

function getEntries(cache: AdAgeContentCache): Array<AdAgeEntry> {
  const sectionsResult = safeParse(JsonRecordSchema, cache["story-feed-sections"]);
  if (!sectionsResult.success) {
    return [];
  }

  return Object.values(sectionsResult.output).flatMap((section) => {
    const sectionResult = safeParse(StoryFeedSectionSchema, section);
    if (!sectionResult.success) {
      return [];
    }

    return (sectionResult.output.data?.content_elements ?? []).flatMap((entry) => {
      const entryResult = safeParse(AdAgeEntrySchema, entry);
      return entryResult.success ? [entryResult.output] : [];
    });
  });
}

function getEntryLink(entry: AdAgeEntry): string | undefined {
  const path = entry.website_url ?? entry.websites?.adage?.website_url ?? entry.canonical_url;

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

  const result = safeParse(JsonRecordSchema, JSON.parse(contentCache));
  if (!result.success) {
    throw new Error("Invalid Fusion.contentCache payload");
  }

  return result.output;
}

export async function parse(response: Response, now: Date = new Date()): Promise<RSSData> {
  const html = await response.text();
  const contentCache = parseContentCache(html);

  const entries: Array<RSSEntry> = getEntries(contentCache)
    .flatMap((entry) => {
      const link = getEntryLink(entry);
      const title = getEntryTitle(entry);
      const datetime = parseEntryDate(entry);

      if (!link || !title || (datetime && datetime > now)) {
        return [];
      }

      return [
        {
          datetime,
          id: link,
          imageURL: getEntryImageURL(entry),
          link,
          text: getEntryText(entry, title),
          title,
        },
      ];
    })
    .filter(isValidRSSEntry);

  return {
    description: "Latest News",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Latest News - Ad Age",
  };
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(ctx.env)(BASE_URL, {
    headers: {
      accept: "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
