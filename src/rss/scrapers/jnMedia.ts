import { USERAGENT, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  check,
  fallback,
  literal,
  looseObject,
  nullish,
  minLength,
  number,
  pipe,
  safeParse,
  string,
  tuple,
  unknown,
  type InferOutput,
} from "valibot";

const SITE_ORIGIN = "https://www.jn.pt";
const SECTION_PATH = "/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;
const PAGE_COUNT = 2;

// JN is a Next.js app. Each page embeds its React Server Components (RSC) payload
// in scripts like `self.__next_f.push([1,"<payload chunk>"])`. The scraper reads the
// article list from that payload, because the rendered markup uses CSS module class
// names that change with each JN build.
const NEXT_PUSH_PATTERN = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
const COLON = 0x3a;
const COMMA = 0x2c;
const NEWLINE = 0x0a;
const TEXT_ROW_TAG = 0x54; // "T"

type FetchFn = typeof fetch;

const OptionalTextSchema = fallback(nullish(string()), undefined);
// Next.js uses `[1, "<chunk>"]` for payload text. Other push types carry no page data.
const NextPayloadPushSchema = tuple([literal(1), string()]);
const JnMediaSchema = looseObject({
  MediaType: OptionalTextSchema,
  Url: OptionalTextSchema,
});
const JnArticleSchema = looseObject({
  Abstract: OptionalTextSchema,
  Date: OptionalTextSchema,
  Media: fallback(nullish(array(unknown())), undefined),
  PreTitle: OptionalTextSchema,
  Title: OptionalTextSchema,
  Url: OptionalTextSchema,
});
// The section list object also has "PageContext", "PageSize" and "Offset".
// "Page" separates it from navigation menus, which also have "Items".
const JnArticleListSchema = looseObject({
  Items: array(unknown()),
  Page: number(),
});

// Fallback when JN renames the list fields: any array of objects with a title and a
// section URL. Navigation links use "Name", so the "Title" field excludes them.
const JnSectionArticlesSchema = pipe(
  array(looseObject({ Title: string(), Url: string() })),
  minLength(1),
  check((articles) => articles.every((article) => isSectionUrl(resolveUrl(article.Url)))),
);

type JnArticle = InferOutput<typeof JnArticleSchema>;

function readNextPayload(html: string): string {
  let payload = "";
  for (const match of html.matchAll(NEXT_PUSH_PATTERN)) {
    const result = safeParse(NextPayloadPushSchema, JSON.parse(match[1]));
    if (result.success) {
      payload += result.output[1];
    }
  }

  return payload;
}

// Splits an RSC payload into the JSON text of its JSON rows.
// Each row is `<hex id>:<value>\n`. Text rows are `<hex id>:T<hex byte length>,<text>`.
// They have no newline terminator, and their text can contain newlines.
export function readFlightJsonRows(payload: string): Array<string> {
  const bytes = new TextEncoder().encode(payload);
  const decoder = new TextDecoder();
  const rows: Array<string> = [];
  let position = 0;

  while (position < bytes.length) {
    const colon = bytes.indexOf(COLON, position);
    if (colon < 0) {
      break;
    }

    if (bytes[colon + 1] === TEXT_ROW_TAG) {
      const comma = bytes.indexOf(COMMA, colon);
      const textLength = Number.parseInt(decoder.decode(bytes.subarray(colon + 2, comma)), 16);
      if (comma < 0 || Number.isNaN(textLength)) {
        break;
      }

      position = comma + 1 + textLength;
      continue;
    }

    const newline = bytes.indexOf(NEWLINE, colon);
    const end = newline < 0 ? bytes.length : newline;
    const value = decoder.decode(bytes.subarray(colon + 1, end));
    if (value.startsWith("[") || value.startsWith("{")) {
      rows.push(value);
    }

    position = end + 1;
  }

  return rows;
}

function findArticleList(jsonRows: Array<string>): Array<unknown> | undefined {
  let listItems: Array<unknown> | undefined;
  let sectionArticles: Array<unknown> | undefined;
  for (const row of jsonRows) {
    // The list sits deep in the React element tree. The reviver visits every value.
    JSON.parse(row, (_key, value) => {
      const listResult = listItems ? undefined : safeParse(JnArticleListSchema, value);
      if (listResult?.success) {
        listItems = listResult.output.Items;
      }

      const articlesResult = sectionArticles
        ? undefined
        : safeParse(JnSectionArticlesSchema, value);
      if (articlesResult?.success) {
        sectionArticles = articlesResult.output;
      }

      return value;
    });
  }

  return listItems ?? sectionArticles;
}

function normalizeText(value: string | null | undefined): string | undefined {
  return value?.replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim() || undefined;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function resolveUrl(value: string | null | undefined): string | undefined {
  if (!value || !URL.canParse(value, SITE_ORIGIN)) {
    return undefined;
  }

  const url = new URL(value, SITE_ORIGIN);
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
}

// Keeps only JN links inside the section, so a wrong list cannot fill the feed
// with articles from other sections.
function isSectionUrl(link: string | undefined): boolean {
  if (!link) {
    return false;
  }

  const url = new URL(link);
  return url.origin === SITE_ORIGIN && url.pathname.startsWith(`${SECTION_PATH}/`);
}

function findImageUrl(media: Array<unknown> | null | undefined): string | undefined {
  for (const item of media ?? []) {
    const result = safeParse(JnMediaSchema, item);
    if (result.success && result.output.MediaType === "image") {
      return resolveUrl(result.output.Url);
    }
  }

  return undefined;
}

function parseArticle(article: JnArticle): RSSEntry | undefined {
  const link = resolveUrl(article.Url);
  const title = normalizeText(article.Title);
  if (!link || !isSectionUrl(link) || !title) {
    return undefined;
  }

  return {
    datetime: parseDate(article.Date),
    id: link,
    imageURL: findImageUrl(article.Media),
    link,
    text: normalizeText(article.PreTitle) ?? normalizeText(article.Abstract) ?? title,
    title,
  };
}

export function parsePage(html: string): Array<RSSEntry> {
  const items = findArticleList(readFlightJsonRows(readNextPayload(html)));
  if (!items) {
    throw new Error("JN media page has no article list in its RSC payload");
  }

  return items.flatMap((item) => {
    const result = safeParse(JnArticleSchema, item);
    const entry = result.success ? parseArticle(result.output) : undefined;
    return entry ? [entry] : [];
  });
}

function pageUrl(page: number): string {
  return page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`JN media request failed: ${response.status}`);
  }

  return response.text();
}

export async function scrapeFirstPages(fetchFn: FetchFn): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    for (const entry of parsePage(await fetchPage(pageUrl(page), fetchFn))) {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        entries.push(entry);
      }
    }
  }

  return {
    description: "Jornal de Notícias Média",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "JN - Média",
  };
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapeFirstPages(fetchFn);
}
