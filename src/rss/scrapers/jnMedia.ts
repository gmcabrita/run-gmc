import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_ORIGIN = "https://www.jn.pt";
const SECTION_PATH = "/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;

type FetchFn = typeof fetch;

interface DraftEntry extends RSSEntry {
  section: string;
}

interface ParsedPage {
  entries: Array<RSSEntry>;
  nextPageURL?: string;
}

const HTML_ENTITY_BY_NAME = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

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
  return decodeHtmlEntities(text).replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim();
}

function getLastEntry(entries: Array<DraftEntry>): DraftEntry | undefined {
  return entries.at(-1);
}

function getImageURL(el: Element): string | undefined {
  const src = el.getAttribute("src");
  if (!src) {
    return undefined;
  }

  const decodedSrc = decodeHtmlEntities(src);
  if (decodedSrc.startsWith("data:")) {
    return undefined;
  }

  return new URL(decodedSrc, SITE_ORIGIN).href;
}

function normalizePageUrl(href: string): string {
  return new URL(decodeHtmlEntities(href), SITE_ORIGIN).href;
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<Response> {
  const response = await fetchFn(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`JN media request failed: ${response.status}`);
  }

  return response;
}

function buildFeed(entries: Array<RSSEntry>): RSSData {
  return {
    description: "Jornal de Notícias Média",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "JN - Média",
  };
}

export async function parsePage(response: Response): Promise<ParsedPage> {
  // JN wraps server-rendered articles in <noscript>; unwrap them before the
  // parsing pass because HTMLRewriter otherwise treats their markup as text.
  const unwrappedResponse = new HTMLRewriter()
    .on("main#main-content noscript", {
      element(el) {
        el.removeAndKeepContent();
      },
    })
    .transform(response);
  const draftEntries: Array<DraftEntry> = [];
  let nextPageURL: string | undefined;
  const articleSelector =
    'main#main-content [class*="section-regular"][class*="ArticlesList"] article[class*="ArticleWrap"]';

  const rewriter = new HTMLRewriter()
    .on(articleSelector, {
      element() {
        draftEntries.push({
          id: "",
          link: "",
          section: "",
          text: "",
          title: "",
        });
      },
    })
    .on(`${articleSelector} a[class*="TitleLink"]`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const href = el.getAttribute("href");
        if (!entry || !href) {
          return;
        }

        const link = normalizePageUrl(href);
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
    .on(`${articleSelector} span[class*="Section"]`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.section += text.text;
        }
      },
    })
    .on(`${articleSelector} img`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const imageURL = getImageURL(el);
        if (entry && imageURL && !entry.imageURL) {
          entry.imageURL = imageURL;
        }
      },
    })
    .on('main#main-content a[href*="?page="]', {
      element(el) {
        if (nextPageURL) {
          return;
        }

        const href = el.getAttribute("href");
        if (href) {
          nextPageURL = normalizePageUrl(href);
        }
      },
    });

  const body = rewriter.transform(unwrappedResponse).body;
  if (!body) {
    throw new Error("Missing response body");
  }

  await consume(body);

  return {
    entries: draftEntries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        const section = normalizeWhitespace(entry.section);

        return {
          id: entry.id,
          imageURL: entry.imageURL,
          link: entry.link,
          text: section || title,
          title,
        };
      })
      .filter(isValidRSSEntry),
    nextPageURL,
  };
}

export async function scrapeFirstTwoPages(fetchFn: FetchFn): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const seenIds = new Set<string>();
  let currentPageURL: string | undefined = BASE_URL;

  for (let pageNumber = 0; pageNumber < 2 && currentPageURL; pageNumber += 1) {
    const page = await parsePage(await fetchPage(currentPageURL, fetchFn));

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
