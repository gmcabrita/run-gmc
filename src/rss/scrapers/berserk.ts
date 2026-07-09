import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch } from "../../proxiedFetch";

const MANGA_ID = "801513ba-a712-498c-8f57-cae55b38cc92";
const BASE_URL = `https://mangadex.org/title/${MANGA_ID}/berserk`;
const API_URL =
  `https://api.mangadex.org/manga/${MANGA_ID}/feed?translatedLanguage[]=en&excludedGroups[]=48d8a115-31b6-462f-a0db-04cc09846453&limit=10&includes[]=scanlation_group&includes[]=manga&order[volume]=desc&order[chapter]=desc&offset=0&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&includeUnavailable=0`;

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

export function parse(json: unknown): RSSData {
  const entries: RSSEntry[] = readChapters(json)
    .map((chapter) => {
      const groupNames = chapter.scanlationGroups.join(", ") || "Unknown scanlation group";
      const chapterLabel = chapter.chapter ? `Chapter ${chapter.chapter}` : "Chapter";
      const title = `Berserk — ${chapterLabel}${chapter.title ? `: ${chapter.title}` : ""} — ${groupNames}`;
      const details = [
        `<strong>Scanlation group:</strong> ${escapeHtml(groupNames)}`,
        chapter.volume ? `<strong>Volume:</strong> ${escapeHtml(chapter.volume)}` : undefined,
        chapter.chapter ? `<strong>Chapter:</strong> ${escapeHtml(chapter.chapter)}` : undefined,
        chapter.title ? escapeHtml(chapter.title) : undefined,
      ].filter((detail): detail is string => detail !== undefined);

      return {
        id: chapter.id,
        link: `https://mangadex.org/chapter/${chapter.id}`,
        title,
        text: details.join("<br>"),
        datetime: chapter.publishedAt,
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Berserk chapters",
    description: "English Berserk chapter releases from MangaDex",
    language: "en",
    entries,
  };
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(ctx.env)(API_URL, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`MangaDex request failed: ${response.status}`);
  }

  return parse(await response.json());
}
