import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  boolean,
  fallback,
  looseObject,
  safeParse,
  string,
} from "valibot";

const SITE_ORIGIN = "https://www.cmjornal.pt";
const SECTION_PATH = "/tv-media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;
const FIRST_PAGE_URL = new URL(
  "/tv-media/loadmore?friendlyUrl=tv-media&contentStartIndex=0",
  SITE_ORIGIN,
).href;
const PAGE_SIZE = 10;
const REQUEST_RETRY_COUNT = 3;

const PT_MONTH_INDEX = new Map([
  ["janeiro", 0],
  ["fevereiro", 1],
  ["marco", 2],
  ["abril", 3],
  ["maio", 4],
  ["junho", 5],
  ["julho", 6],
  ["agosto", 7],
  ["setembro", 8],
  ["outubro", 9],
  ["novembro", 10],
  ["dezembro", 11],
]);

type FetchFn = typeof fetch;

interface DraftEntry extends RSSEntry {
  publishedAt: string;
}

interface LoadMorePage {
  entries: Array<RSSEntry>;
  nextPageURL?: string;
}

interface ParsedPageResult {
  isPartial: boolean;
  page: LoadMorePage;
}

const HTML_ENTITY_BY_NAME = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);
const RetryableFailureSchema = looseObject({
  message: fallback(string(), ""),
  retryable: fallback(boolean(), false),
});

function decodeHtmlEntities(text: string): string {
  return text.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalizedEntity = entity.toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITY_BY_NAME.get(normalizedEntity) ?? match;
  });
}

function normalizeWhitespace(text: string): string {
  return decodeHtmlEntities(text).replaceAll(/\s+/g, " ").trim();
}

function normalizeToken(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "");
}

function getLastEntry(entries: Array<DraftEntry>): DraftEntry | undefined {
  return entries.at(-1);
}

function normalizeAjaxUrl(value: string): string {
  return value.replaceAll("&amp;", "&");
}

function parsePtDateTime(value: string): Date | undefined {
  const match = normalizeToken(value).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\s+as\s+(\d{1,2}):(\d{2})/);
  if (!match) {
    return undefined;
  }

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const day = Number(dayText);
  const monthIndex = PT_MONTH_INDEX.get(monthText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isFinite(day) ||
    monthIndex == null ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return undefined;
  }

  const parsed = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute
  ) {
    return undefined;
  }

  return parsed;
}

function getImageURL(el: Element): string | undefined {
  const dataSrc = el.getAttribute("data-src");
  if (dataSrc) {
    return dataSrc;
  }

  const src = el.getAttribute("src");
  if (!src || src.startsWith("data:")) {
    return undefined;
  }

  return src;
}

function buildFallbackNextPageURL(currentPageURL: string): string {
  const url = new URL(currentPageURL);
  const currentIndex = Number(url.searchParams.get("contentStartIndex") ?? "0");
  const nextIndex = Number.isFinite(currentIndex) ? currentIndex + PAGE_SIZE : PAGE_SIZE;
  url.searchParams.set("contentStartIndex", String(nextIndex));
  url.searchParams.delete("lastContentId");
  url.searchParams.delete("urlRefParameters");
  return url.toString();
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<Response> {
  const response = await fetchFn(url, {
    headers: {
      accept: "text/html, */*;q=0.1",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`CM Jornal request failed: ${response.status}`);
  }

  return response;
}

function buildFeed(entries: Array<RSSEntry>): RSSData {
  return {
    description: "CM Jornal TV Media",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "CM Jornal - TV Media",
  };
}

export async function parsePage(response: Response): Promise<LoadMorePage> {
  return (await parsePageWithFallback(response)).page;
}

async function parsePageWithFallback(
  response: Response,
  fallbackNextPageURL?: string,
): Promise<ParsedPageResult> {
  const draftEntries: Array<DraftEntry> = [];
  let nextPageURL: string | undefined;
  let isPartial = false;

  const rewriter = new HTMLRewriter()
    .on("article.destaque", {
      element() {
        draftEntries.push({
          id: "",
          link: "",
          publishedAt: "",
          text: "",
          title: "",
        });
      },
    })
    .on("article.destaque .text_container a.destaque_titulo", {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const href = el.getAttribute("href");
        if (!entry || !href) {
          return;
        }

        const link = new URL(href, SITE_ORIGIN).href;
        entry.id = link;
        entry.link = link;
      },
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.title += text.text;
        }
      },
    })
    .on("article.destaque .text_container p.destaque_lead", {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.text = (entry.text ?? "") + text.text;
        }
      },
    })
    .on("article.destaque .text_container p.destaque_time", {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.publishedAt += text.text;
        }
      },
    })
    .on("article.destaque .figure_container img", {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const imageURL = getImageURL(el);
        if (entry && imageURL) {
          entry.imageURL = new URL(imageURL, SITE_ORIGIN).href;
        }
      },
    })
    .on(".container_botao_ver_mais_noticias a", {
      element(el) {
        if (nextPageURL) {
          return;
        }

        const nextPagePath = el.getAttribute("data-ajax-url");
        if (nextPagePath) {
          nextPageURL = new URL(normalizeAjaxUrl(nextPagePath), SITE_ORIGIN).href;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing response body");
  }

  try {
    await consume(body);
  } catch (error) {
    const failureResult = safeParse(RetryableFailureSchema, error);
    const isRetryable =
      failureResult.success &&
      (failureResult.output.retryable ||
        failureResult.output.message.includes("Network connection lost"));
    if (!isRetryable || draftEntries.length === 0) {
      throw error;
    }

    isPartial = true;
  }

  if (!nextPageURL && fallbackNextPageURL && draftEntries.length > 0) {
    nextPageURL = fallbackNextPageURL;
  }

  return {
    isPartial,
    page: {
      entries: draftEntries
        .map((entry) => {
          const title = normalizeWhitespace(entry.title);
          const text = normalizeWhitespace(entry.text ?? "") || title;

          return {
            datetime: parsePtDateTime(entry.publishedAt),
            id: entry.id,
            imageURL: entry.imageURL,
            link: entry.link,
            text,
            title,
          };
        })
        .filter(isValidRSSEntry),
      nextPageURL,
    },
  };
}

async function loadPage(url: string, fetchFn: FetchFn): Promise<LoadMorePage> {
  let bestPage: LoadMorePage | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < REQUEST_RETRY_COUNT; attempt += 1) {
    try {
      const result = await parsePageWithFallback(await fetchPage(url, fetchFn), buildFallbackNextPageURL(url));

      if (!bestPage || result.page.entries.length > bestPage.entries.length) {
        bestPage = result.page;
      }

      if (!result.isPartial || result.page.entries.length >= PAGE_SIZE) {
        return result.page;
      }
    } catch (error) {
      const failureResult = safeParse(RetryableFailureSchema, error);
      const isRetryable =
        failureResult.success &&
        (failureResult.output.retryable ||
          failureResult.output.message.includes("Network connection lost"));
      if (error instanceof Error) {
        lastError = error;
      }

      if (!isRetryable || attempt === REQUEST_RETRY_COUNT - 1) {
        if (bestPage) {
          return bestPage;
        }

        throw error;
      }
    }
  }

  if (bestPage) {
    return bestPage;
  }

  throw lastError ?? new Error("Failed to load CM Jornal page");
}

export async function scrapeFirstTwoPages(fetchFn: FetchFn): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const seenIds = new Set<string>();
  let currentPageURL: string | undefined = FIRST_PAGE_URL;

  for (let pageNumber = 0; pageNumber < 2 && currentPageURL; pageNumber += 1) {
    const pageURL = currentPageURL;
    const page = await loadPage(pageURL, fetchFn);

    for (const entry of page.entries) {
      if (seenIds.has(entry.id)) {
        continue;
      }

      seenIds.add(entry.id);
      entries.push(entry);
    }

    currentPageURL = page.nextPageURL;
    if (!currentPageURL && page.entries.length >= PAGE_SIZE) {
      currentPageURL = buildFallbackNextPageURL(pageURL);
    }
  }

  return buildFeed(entries);
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapeFirstTwoPages(fetchFn);
}
