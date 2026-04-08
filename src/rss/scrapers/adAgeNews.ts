import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://adage.com/news/";
const SITE_ORIGIN = "https://adage.com";
const CONTENT_CACHE_PATTERN = /Fusion\.contentCache=(\{[\s\S]*?\});Fusion\./;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getRecord(record: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function getString(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function getEntries(cache: JsonRecord): Array<JsonRecord> {
  const storyFeedSections = getRecord(cache, "story-feed-sections");
  if (!storyFeedSections) {
    return [];
  }

  return Object.values(storyFeedSections)
    .filter(isRecord)
    .map((section) => getRecord(section, "data"))
    .filter((sectionData): sectionData is JsonRecord => sectionData !== undefined)
    .flatMap((sectionData) => {
      const contentElements = sectionData["content_elements"];
      return Array.isArray(contentElements) ? contentElements.filter(isRecord) : [];
    });
}

function getEntryLink(entry: JsonRecord): string | undefined {
  const websites = getRecord(entry, "websites");
  const adageWebsite = getRecord(websites, "adage");
  const path =
    getString(entry, "website_url") ?? getString(adageWebsite, "website_url") ?? getString(entry, "canonical_url");

  if (!path || path.trim() === "") {
    return undefined;
  }

  return new URL(path, SITE_ORIGIN).toString();
}

function getEntryTitle(entry: JsonRecord): string | undefined {
  return getString(getRecord(entry, "headlines"), "basic")?.trim();
}

function getEntryText(entry: JsonRecord, title: string): string {
  const description = getString(getRecord(entry, "description"), "basic")?.trim();
  return description && description !== "" ? description : title;
}

function getEntryImageURL(entry: JsonRecord): string | undefined {
  const promoItems = getRecord(entry, "promo_items");
  const basicPromo = getRecord(promoItems, "basic");
  const imageURL = getString(basicPromo, "url")?.trim();

  return imageURL && imageURL !== "" ? imageURL : undefined;
}

function parseEntryDate(entry: JsonRecord): Date | undefined {
  const rawDate = getString(entry, "display_date") ?? getString(entry, "publish_date") ?? getString(entry, "first_publish_date");
  if (!rawDate) {
    return undefined;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseContentCache(html: string): JsonRecord {
  const match = html.match(CONTENT_CACHE_PATTERN);
  const contentCache = match?.[1];
  if (!contentCache) {
    throw new Error("Missing Fusion.contentCache payload");
  }

  const parsed: unknown = JSON.parse(contentCache);
  if (!isRecord(parsed)) {
    throw new Error("Invalid Fusion.contentCache payload");
  }

  return parsed;
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

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
      accept: "text/html",
    },
  });

  return parse(response);
}
