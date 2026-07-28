import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch } from "../proxiedFetch";

const MANGADEX_API_URL = "https://api.mangadex.org";
const MANGADEX_SITE_URL = "https://mangadex.org";
const DEFAULT_CONTENT_RATINGS: readonly MangaDexContentRating[] = [
  "safe",
  "suggestive",
  "erotica",
  "pornographic",
];

export type MangaDexContentRating = "safe" | "suggestive" | "erotica" | "pornographic";

export interface MangaDexFeedConfig {
  mangaId: string;
  mangaTitle: string;
  mangaSlug?: string;
  language: string;
  excludedGroupIds?: readonly string[];
  limit?: number;
  contentRatings?: readonly MangaDexContentRating[];
  includeUnavailable?: boolean;
  feedTitle?: string;
  description?: string;
}

interface MangaDexChapter {
  id: string;
  volume?: string;
  chapter?: string;
  title?: string;
  publishedAt?: Date;
  scanlationGroups: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readDate(value: unknown): Date | undefined {
  const rawDate = readString(value);
  if (!rawDate) {
    return undefined;
  }

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readScanlationGroupName(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== "scanlation_group" || !isRecord(value.attributes)) {
    return undefined;
  }

  return readString(value.attributes.name);
}

function readChapter(value: unknown): MangaDexChapter | undefined {
  if (!isRecord(value) || !isRecord(value.attributes) || !Array.isArray(value.relationships)) {
    return undefined;
  }

  const id = readString(value.id);
  if (!id) {
    return undefined;
  }

  return {
    id,
    volume: readString(value.attributes.volume),
    chapter: readString(value.attributes.chapter),
    title: readString(value.attributes.title),
    publishedAt: readDate(value.attributes.publishAt),
    scanlationGroups: value.relationships.flatMap((relationship) => {
      const name = readScanlationGroupName(relationship);
      return name ? [name] : [];
    }),
  };
}

function readChapters(value: unknown): MangaDexChapter[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return [];
  }

  return value.data.flatMap((chapter) => {
    const parsedChapter = readChapter(chapter);
    return parsedChapter ? [parsedChapter] : [];
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMangaUrl(config: MangaDexFeedConfig): string {
  const slug = config.mangaSlug ? `/${encodeURIComponent(config.mangaSlug)}` : "";
  return `${MANGADEX_SITE_URL}/title/${encodeURIComponent(config.mangaId)}${slug}`;
}

export function buildMangaDexFeedUrl(config: MangaDexFeedConfig): string {
  const url = new URL(`/manga/${encodeURIComponent(config.mangaId)}/feed`, MANGADEX_API_URL);
  url.searchParams.append("translatedLanguage[]", config.language);

  for (const groupId of config.excludedGroupIds ?? []) {
    url.searchParams.append("excludedGroups[]", groupId);
  }

  url.searchParams.set("limit", String(config.limit ?? 10));
  url.searchParams.append("includes[]", "scanlation_group");
  url.searchParams.append("includes[]", "manga");
  url.searchParams.set("order[volume]", "desc");
  url.searchParams.set("order[chapter]", "desc");
  url.searchParams.set("offset", "0");

  for (const contentRating of config.contentRatings ?? DEFAULT_CONTENT_RATINGS) {
    url.searchParams.append("contentRating[]", contentRating);
  }

  url.searchParams.set("includeUnavailable", config.includeUnavailable ? "1" : "0");
  return url.toString();
}

export function parseMangaDexFeed(json: unknown, config: MangaDexFeedConfig): RSSData {
  const entries: RSSEntry[] = readChapters(json)
    .map((chapter) => {
      const groupNames = chapter.scanlationGroups.join(", ") || "Unknown scanlation group";
      const chapterLabel = chapter.chapter ? `Chapter ${chapter.chapter}` : "Chapter";
      const title = `${config.mangaTitle} — ${chapterLabel}${chapter.title ? `: ${chapter.title}` : ""} — ${groupNames}`;
      const details = [
        `<strong>Scanlation group:</strong> ${escapeHtml(groupNames)}`,
        chapter.volume ? `<strong>Volume:</strong> ${escapeHtml(chapter.volume)}` : undefined,
        chapter.chapter ? `<strong>Chapter:</strong> ${escapeHtml(chapter.chapter)}` : undefined,
        chapter.title ? escapeHtml(chapter.title) : undefined,
      ].filter((detail): detail is string => detail !== undefined);

      return {
        id: chapter.id,
        link: `${MANGADEX_SITE_URL}/chapter/${chapter.id}`,
        title,
        text: details.join("<br>"),
        datetime: chapter.publishedAt,
      };
    })
    .filter(isValidRSSEntry);
  const mangaUrl = getMangaUrl(config);

  return {
    id: mangaUrl,
    link: mangaUrl,
    title: config.feedTitle ?? `${config.mangaTitle} chapters`,
    description: config.description ?? `${config.mangaTitle} chapter releases from MangaDex`,
    language: config.language,
    entries,
  };
}

export async function getMangaDexFeed(
  ctx: ScraperContext,
  config: MangaDexFeedConfig,
): Promise<RSSData> {
  const response = await createProxiedFetch(ctx.env)(buildMangaDexFeedUrl(config), {
    headers: {
      Accept: "application/json",
      "Accept-Language": config.language,
    },
  });

  if (!response.ok) {
    throw new Error(`MangaDex request failed: ${response.status}`);
  }

  return parseMangaDexFeed(await response.json(), config);
}
