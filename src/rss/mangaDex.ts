import { isValidRSSEntry, type ScraperContext } from "@rss/common";
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
import { createProxiedFetch } from "../proxiedFetch";

const MANGADEX_API_URL = "https://api.mangadex.org";
const MANGADEX_SITE_URL = "https://mangadex.org";
const DEFAULT_CONTENT_RATINGS: ReadonlyArray<MangaDexContentRating> = [
  "safe",
  "suggestive",
  "erotica",
  "pornographic",
];

export type MangaDexContentRating = "safe" | "suggestive" | "erotica" | "pornographic";

export interface MangaDexFeedConfig {
  contentRatings?: ReadonlyArray<MangaDexContentRating>;
  description?: string;
  excludedGroupIds?: ReadonlyArray<string>;
  feedTitle?: string;
  includeUnavailable?: boolean;
  language: string;
  limit?: number;
  mangaId: string;
  mangaSlug?: string;
  mangaTitle: string;
}

const OptionalTextSchema = fallback(nullish(string()), undefined);
const MangaDexRelationshipSchema = looseObject({
  attributes: looseObject({
    name: string(),
  }),
  type: string(),
});
const MangaDexChapterPayloadSchema = looseObject({
  attributes: looseObject({
    chapter: OptionalTextSchema,
    publishAt: OptionalTextSchema,
    title: OptionalTextSchema,
    volume: OptionalTextSchema,
  }),
  id: string(),
  relationships: array(unknown()),
});
const MangaDexFeedPayloadSchema = looseObject({
  data: unknown(),
});
const MangaDexFeedDataSchema = looseObject({
  data: array(unknown()),
});

export type MangaDexFeedPayload = InferOutput<typeof MangaDexFeedPayloadSchema>;
type MangaDexChapterPayload = InferOutput<typeof MangaDexChapterPayloadSchema>;

interface MangaDexChapter {
  chapter?: string;
  id: string;
  publishedAt?: Date;
  scanlationGroups: Array<string>;
  title?: string;
  volume?: string;
}

const EMPTY_MANGADEX_PAYLOAD = { data: [] } satisfies MangaDexFeedPayload;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function parseOptionalDate(value: string | null | undefined): Date | undefined {
  const rawDate = normalizeOptionalText(value);
  if (!rawDate) {
    return undefined;
  }

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readChapter(payload: MangaDexChapterPayload): MangaDexChapter | undefined {
  const id = normalizeOptionalText(payload.id);
  if (!id) {
    return undefined;
  }

  return {
    chapter: normalizeOptionalText(payload.attributes.chapter),
    id,
    publishedAt: parseOptionalDate(payload.attributes.publishAt),
    scanlationGroups: payload.relationships.flatMap((relationship) => {
      const result = safeParse(MangaDexRelationshipSchema, relationship);
      if (!result.success || result.output.type !== "scanlation_group") {
        return [];
      }

      const name = normalizeOptionalText(result.output.attributes.name);
      return name ? [name] : [];
    }),
    title: normalizeOptionalText(payload.attributes.title),
    volume: normalizeOptionalText(payload.attributes.volume),
  };
}

function readChapters(payload: MangaDexFeedPayload): Array<MangaDexChapter> {
  const feedResult = safeParse(MangaDexFeedDataSchema, payload);
  if (!feedResult.success) {
    return [];
  }

  return feedResult.output.data.flatMap((chapter) => {
    const chapterResult = safeParse(MangaDexChapterPayloadSchema, chapter);
    if (!chapterResult.success) {
      return [];
    }

    const parsedChapter = readChapter(chapterResult.output);
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

export function parseMangaDexFeed(
  payload: MangaDexFeedPayload,
  config: MangaDexFeedConfig,
): RSSData {
  const entries: Array<RSSEntry> = readChapters(payload)
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
        datetime: chapter.publishedAt,
        id: chapter.id,
        link: `${MANGADEX_SITE_URL}/chapter/${chapter.id}`,
        text: details.join("<br>"),
        title,
      };
    })
    .filter(isValidRSSEntry);
  const mangaUrl = getMangaUrl(config);

  return {
    description: config.description ?? `${config.mangaTitle} chapter releases from MangaDex`,
    entries,
    id: mangaUrl,
    language: config.language,
    link: mangaUrl,
    title: config.feedTitle ?? `${config.mangaTitle} chapters`,
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

  const payloadResult = safeParse(MangaDexFeedPayloadSchema, await response.json());
  return parseMangaDexFeed(
    payloadResult.success ? payloadResult.output : EMPTY_MANGADEX_PAYLOAD,
    config,
  );
}
