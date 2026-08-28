import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { boolean, fallback, looseObject, safeParse, string, type InferOutput } from "valibot";

const SITE_ORIGIN = "https://www.jornaldenegocios.pt";
const SECTION_PATH = "/empresas/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;
const PAGE_SIZE = 8;
const FIRST_PAGE_URL = new URL(
  "/empresas/media/loadmore?friendlyUrl=empresas/media&contentStartIndex=0",
  SITE_ORIGIN,
).href;
const REQUEST_RETRY_COUNT = 3;
const RetryableFailureSchema = looseObject({
  message: fallback(string(), ""),
  retryable: fallback(boolean(), false),
});

type FetchFn = typeof fetch;
type RetryableFailure = InferOutput<typeof RetryableFailureSchema>;

interface DraftEntry extends RSSEntry {
  authorName: string;
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

function isRetryableFailure(failure: RetryableFailure): boolean {
  return failure.retryable || failure.message.includes("Network connection lost");
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function getLastEntry(entries: Array<DraftEntry>): DraftEntry | undefined {
  return entries.at(-1);
}

function parsePtDate(value: string): Date | undefined {
  const match = normalizeWhitespace(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return undefined;
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return undefined;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

function normalizeAjaxUrl(value: string): string {
  return value.replaceAll("&amp;", "&");
}

function buildFallbackNextPageURL(currentPageURL: string): string {
  const url = new URL(currentPageURL);
  const currentIndex = Number(url.searchParams.get("contentStartIndex") ?? "0");
  const nextIndex = Number.isFinite(currentIndex) ? currentIndex + PAGE_SIZE : PAGE_SIZE;
  url.searchParams.set("contentStartIndex", String(nextIndex));
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
    throw new Error(`Jornal de Negocios request failed: ${response.status}`);
  }

  return response;
}

function buildFeed(entries: Array<RSSEntry>): RSSData {
  return {
    description: "Jornal de Negocios Media",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Jornal de Negocios - Media",
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
          authorName: "",
          id: "",
          link: "",
          publishedAt: "",
          text: "",
          title: "",
        });
      },
    })
    .on("article.destaque .text_container h2 a", {
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
    .on("article.destaque .data_autor span.time", {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.publishedAt += text.text;
        }
      },
    })
    .on("article.destaque .data_autor a", {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.authorName += text.text;
        }
      },
    })
    .on("article.destaque .figure_container img", {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const src = el.getAttribute("src");
        if (entry && src) {
          entry.imageURL = new URL(src, SITE_ORIGIN).href;
        }
      },
    })
    .on(".container_botao_ver_mais_noticias a.load_more", {
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
    const failure = safeParse(RetryableFailureSchema, error);
    if (!failure.success || !isRetryableFailure(failure.output) || draftEntries.length === 0) {
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
          const authorName = normalizeWhitespace(entry.authorName);

          return {
            datetime: parsePtDate(entry.publishedAt),
            id: entry.id,
            imageURL: entry.imageURL,
            link: entry.link,
            text: authorName || title,
            title,
          };
        })
        .filter(isValidRSSEntry),
      nextPageURL,
    },
  };
}

function selectBestPage(bestPage: LoadMorePage | undefined, candidate: LoadMorePage): LoadMorePage {
  return !bestPage || candidate.entries.length > bestPage.entries.length ? candidate : bestPage;
}

function shouldRetryLoad(failure: RetryableFailure | undefined, attempt: number): boolean {
  return Boolean(failure && isRetryableFailure(failure) && attempt < REQUEST_RETRY_COUNT - 1);
}

async function loadPage(url: string, fetchFn: FetchFn): Promise<LoadMorePage> {
  let bestPage: LoadMorePage | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < REQUEST_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetchPage(url, fetchFn);
      const result = await parsePageWithFallback(response, buildFallbackNextPageURL(url));
      bestPage = selectBestPage(bestPage, result.page);

      if (!result.isPartial || result.page.entries.length >= PAGE_SIZE) {
        return result.page;
      }
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      }

      const failure = safeParse(RetryableFailureSchema, error);
      if (!shouldRetryLoad(failure.success ? failure.output : undefined, attempt)) {
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

  throw lastError ?? new Error("Failed to load Jornal de Negocios page");
}

export async function scrapeFirstTwoPages(fetchFn: FetchFn): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const seenIds = new Set<string>();
  let currentPageURL: string | undefined = FIRST_PAGE_URL;

  for (let pageNumber = 0; pageNumber < 2 && currentPageURL; pageNumber += 1) {
    const page = await loadPage(currentPageURL, fetchFn);

    for (const entry of page.entries) {
      if (seenIds.has(entry.id)) {
        continue;
      }

      seenIds.add(entry.id);
      entries.push(entry);
    }

    currentPageURL = page.nextPageURL;
  }

  return buildFeed(entries);
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapeFirstTwoPages(fetchFn);
}
