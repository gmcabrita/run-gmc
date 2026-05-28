import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_ORIGIN = "https://www.publico.pt";
const SECTION_PATH = "/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;

type FetchFn = typeof fetch;

interface DraftEntry extends RSSEntry {
  kicker: string;
  publishedAt: string;
}

interface ParsedPage {
  entries: RSSEntry[];
  nextPageURL?: string;
}

const HTML_ENTITY_BY_NAME: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

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

    return HTML_ENTITY_BY_NAME[normalizedEntity] ?? match;
  });
}

function normalizeWhitespace(text: string): string {
  return decodeHtmlEntities(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getLastEntry(entries: DraftEntry[]): DraftEntry | undefined {
  return entries[entries.length - 1];
}

function normalizePageUrl(href: string): string {
  return new URL(href, SITE_ORIGIN).href;
}

function parsePublishedAt(value: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getImageURLFromInterchange(interchange: string | null): string | undefined {
  if (!interchange) {
    return undefined;
  }

  const match = interchange.match(/\[\s*(https?:\/\/[^,\]]+)/);
  if (!match) {
    return undefined;
  }

  return decodeHtmlEntities(match[1]);
}

function getImageURL(el: Element): string | undefined {
  const src = el.getAttribute("src");
  if (src && !src.startsWith("data:")) {
    return new URL(decodeHtmlEntities(src), SITE_ORIGIN).href;
  }

  return getImageURLFromInterchange(el.getAttribute("data-interchange"));
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<Response> {
  const response = await fetchFn(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Público media request failed: ${response.status}`);
  }

  return response;
}

function buildFeed(entries: RSSEntry[]): RSSData {
  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Público - Media",
    description: "Público Media",
    language: "pt",
    entries,
  };
}

export async function parsePage(response: Response): Promise<ParsedPage> {
  const draftEntries: DraftEntry[] = [];
  let nextPageURL: string | undefined;
  const featuredSelector = ".headline-featured article.card";
  const listItemSelector = "#ul-listing > li.headline-list__item";

  const rewriter = new HTMLRewriter()
    .on(featuredSelector, {
      element() {
        draftEntries.push({
          id: "",
          link: "",
          title: "",
          text: "",
          kicker: "",
          publishedAt: "",
        });
      },
    })
    .on(`${featuredSelector} h3.card__title a.card__faux-block-link`, {
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
    .on(`${featuredSelector} .card__header h4.kicker`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.kicker += text.text;
        }
      },
    })
    .on(`${featuredSelector} figure.card__media img`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const imageURL = getImageURL(el);
        if (entry && imageURL && !entry.imageURL) {
          entry.imageURL = imageURL;
        }
      },
    })
    .on(`${featuredSelector} footer.card__meta time.dateline`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const datetime = el.getAttribute("datetime");
        if (entry && datetime) {
          entry.publishedAt = datetime;
        }
      },
    })
    .on(listItemSelector, {
      element() {
        draftEntries.push({
          id: "",
          link: "",
          title: "",
          text: "",
          kicker: "",
          publishedAt: "",
        });
      },
    })
    .on(`${listItemSelector} div.media-object-section > a`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const href = el.getAttribute("href");
        if (!entry || !href || entry.link) {
          return;
        }

        const link = normalizePageUrl(href);
        entry.id = link;
        entry.link = link;
      },
    })
    .on(`${listItemSelector} h4.headline`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.title += text.text;
        }
      },
    })
    .on(`${listItemSelector} h5.kicker`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.kicker += text.text;
        }
      },
    })
    .on(`${listItemSelector} p.lead.headline-list__blurb`, {
      text(text) {
        const entry = getLastEntry(draftEntries);
        if (entry) {
          entry.text = (entry.text ?? "") + text.text;
        }
      },
    })
    .on(`${listItemSelector} a.headline-list__thumb img`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const imageURL = getImageURL(el);
        if (entry && imageURL && !entry.imageURL) {
          entry.imageURL = imageURL;
        }
      },
    })
    .on(`${listItemSelector} footer.headline-list__footer time.dateline`, {
      element(el) {
        const entry = getLastEntry(draftEntries);
        const datetime = el.getAttribute("datetime");
        if (entry && datetime) {
          entry.publishedAt = datetime;
        }
      },
    })
    .on('a.module__button--more[href*="page="]', {
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

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing response body");
  }

  await consume(body);

  return {
    entries: draftEntries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        const kicker = normalizeWhitespace(entry.kicker);
        const lead = normalizeWhitespace(entry.text ?? "");

        return {
          id: entry.id,
          link: entry.link,
          title,
          text: lead || kicker || title,
          datetime: parsePublishedAt(entry.publishedAt),
          imageURL: entry.imageURL,
        };
      })
      .filter(isValidRSSEntry),
    nextPageURL,
  };
}

export async function scrapeFirstTwoPages(fetchFn: FetchFn): Promise<RSSData> {
  const entries: RSSEntry[] = [];
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
