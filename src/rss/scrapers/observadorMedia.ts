import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_ORIGIN = "https://observador.pt";
const SECTION_PATH = "/seccao/sociedade/media/";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;

type FetchFn = typeof fetch;

interface DraftEntry extends RSSEntry {
  topic: string;
  columnistName: string;
  publishedAt: string;
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
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
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
  return decodeHtmlEntities(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getLastEntry(entries: DraftEntry[]): DraftEntry | undefined {
  return entries[entries.length - 1];
}

function parseIsoDateTime(value: string): Date | undefined {
  const match = value.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})/);
  if (!match) {
    return undefined;
  }

  const parsed = new Date(match[0]);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getImageURL(el: Element): string | undefined {
  const src = el.getAttribute("src") ?? el.getAttribute("data-src");
  if (!src || src.startsWith("data:")) {
    return undefined;
  }

  return new URL(src, SITE_ORIGIN).href;
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<Response> {
  const response = await fetchFn(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Observador request failed: ${response.status}`);
  }

  return response;
}

function buildFeed(entries: RSSEntry[]): RSSData {
  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Observador - Media",
    description: "Observador Media",
    language: "pt",
    entries,
  };
}

export async function parsePage(response: Response): Promise<RSSData> {
  const draftEntries: DraftEntry[] = [];
  const entrySelector = '.editorial-grid .mod[class*="mod-posttype-"]';

  const rewriter = new HTMLRewriter()
    .on(entrySelector, {
      element() {
        draftEntries.push({
          id: "",
          link: "",
          title: "",
          text: "",
          topic: "",
          columnistName: "",
          publishedAt: "",
        });
      },
    })
    .on(`${entrySelector} .title a`, {
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
    .on(`${entrySelector} .topic`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.topic += text.text;
        }
      },
    })
    .on(`${entrySelector} .columnist-name a`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.columnistName += text.text;
        }
      },
    })
    .on(`${entrySelector} .lead`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.text = (entry.text ?? "") + text.text;
        }
      },
    })
    .on(`${entrySelector} time.timeago`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const datetime = el.getAttribute("datetime") ?? el.getAttribute("title");
        if (entry && datetime) {
          entry.publishedAt = datetime;
        }
      },
    })
    .on(`${entrySelector} .image img`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const imageURL = getImageURL(el);
        if (entry && imageURL && !entry.imageURL) {
          entry.imageURL = imageURL;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing response body");
  }

  await consume(body);

  return buildFeed(
    draftEntries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        const lead = normalizeWhitespace(entry.text ?? "");
        const columnistName = normalizeWhitespace(entry.columnistName);
        const topic = normalizeWhitespace(entry.topic);

        return {
          id: entry.id,
          link: entry.link,
          title,
          text: lead || columnistName || topic || title,
          datetime: parseIsoDateTime(entry.publishedAt),
          imageURL: entry.imageURL,
        };
      })
      .filter(isValidRSSEntry),
  );
}

export async function scrapePage(fetchFn: FetchFn): Promise<RSSData> {
  return parsePage(await fetchPage(BASE_URL, fetchFn));
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapePage(fetchFn);
}
