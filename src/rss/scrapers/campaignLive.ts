import { consume, decodeHtmlEntities, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";

const SITE_ORIGIN = "https://www.campaignlive.co.uk";
const SECTION_URLS = [
  `${SITE_ORIGIN}/news`,
  `${SITE_ORIGIN}/in-depth`,
  `${SITE_ORIGIN}/the-work`,
  `${SITE_ORIGIN}/the-knowledge`,
];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

interface CampaignLiveDraftEntry {
  byline: string;
  href?: string;
  imageURL?: string;
  title: string;
}

function normalizeText(value: string): string | undefined {
  return (
    decodeHtmlEntities(value).replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim() || undefined
  );
}

function resolveSiteUrl(value: string | undefined): string | undefined {
  if (!value || !URL.canParse(decodeHtmlEntities(value), SITE_ORIGIN)) {
    return undefined;
  }

  // HTMLRewriter returns raw attribute values, so entities like &amp; are still encoded.
  const url = new URL(decodeHtmlEntities(value), SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) {
    return undefined;
  }

  url.hash = "";
  return url.href;
}

// Article URLs are used as feed item ids, so drop query strings to keep one id per article.
function resolveArticleUrl(value: string | undefined): string | undefined {
  const href = resolveSiteUrl(value);
  if (!href) {
    return undefined;
  }

  const url = new URL(href);
  if (!url.pathname.startsWith("/article/")) {
    return undefined;
  }

  url.search = "";
  return url.href;
}

// Bylines look like "by Staff | 30 September 2026". Some list layouts have no byline.
export function parseBylineDate(byline: string): Date | undefined {
  const match = byline.match(/(\d{1,2}) ([A-Za-z]+) (\d{4})/);
  if (!match) {
    return undefined;
  }

  const [, day, monthName, year] = match;
  const month = MONTHS.indexOf(monthName!.toLowerCase());
  if (month === -1) {
    return undefined;
  }

  return new Date(Date.UTC(Number(year), month, Number(day)));
}

function parseDraftEntry(entry: CampaignLiveDraftEntry): RSSEntry | undefined {
  const link = resolveArticleUrl(entry.href);
  const title = normalizeText(entry.title);
  if (!link || !title) {
    return undefined;
  }

  return {
    datetime: parseBylineDate(entry.byline),
    id: link,
    imageURL: resolveSiteUrl(entry.imageURL),
    link,
    text: title,
    title,
  };
}

function appendToLatestEntry(
  entries: Array<CampaignLiveDraftEntry>,
  field: "byline" | "title",
  value: string,
): void {
  const entry = entries.at(-1);
  if (entry) {
    entry[field] += value;
  }
}

// Returns the article cards of one section page. Cards without an <h3> title,
// such as the "most read" list, are skipped.
export async function parseSection(response: Response): Promise<Array<RSSEntry>> {
  const draftEntries: Array<CampaignLiveDraftEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".contentList__item", {
      element() {
        draftEntries.push({ byline: "", title: "" });
      },
    })
    .on('.contentList__item a[href*="/article/"]', {
      element(element) {
        const entry = draftEntries.at(-1);
        if (entry && !entry.href) {
          entry.href = element.getAttribute("href") ?? undefined;
        }
      },
    })
    .on(".contentList__item h3", {
      text(text) {
        appendToLatestEntry(draftEntries, "title", text.text);
      },
    })
    .on(".contentList__item .byline", {
      text(text) {
        appendToLatestEntry(draftEntries, "byline", text.text);
      },
    })
    .on(".contentList__item img", {
      element(element) {
        const entry = draftEntries.at(-1);
        if (entry && !entry.imageURL) {
          entry.imageURL = element.getAttribute("src") ?? undefined;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing Campaign response body");
  }
  await consume(body);

  return draftEntries.flatMap((entry) => {
    const parsedEntry = parseDraftEntry(entry);
    return parsedEntry ? [parsedEntry] : [];
  });
}

// The same article can show up in several sections and sidebars. Keep the
// first occurrence and fill in the date or image from later occurrences.
export function mergeEntries(sections: Array<Array<RSSEntry>>): Array<RSSEntry> {
  const entries = new Map<string, RSSEntry>();

  for (const entry of sections.flat()) {
    const existing = entries.get(entry.id);
    if (existing) {
      existing.datetime ??= entry.datetime;
      existing.imageURL ??= entry.imageURL;
    } else {
      entries.set(entry.id, { ...entry });
    }
  }

  return [...entries.values()];
}

function getRequestHeaders(): HeadersInit {
  return {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    Priority: "u=0, i",
    "Sec-CH-UA": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": USER_AGENT,
  };
}

async function scrapeSection(fetchFn: typeof fetch, url: string): Promise<Array<RSSEntry>> {
  const response = await fetchFn(url, { headers: getRequestHeaders() });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Campaign request failed for ${url}: ${response.status}`);
  }

  const entries = await parseSection(response);
  // An empty section means the page layout changed or the relay returned an error page.
  if (entries.length === 0) {
    throw new Error(`Campaign section has no articles: ${url}`);
  }

  return entries;
}

// Campaign sits behind a Cloudflare challenge. Direct requests get a 403, so
// all requests go through the relay with full browser navigation headers.
export async function scrape(
  env: ProxiedFetchEnv,
  fetchFn: typeof fetch = fetch,
): Promise<RSSData> {
  const proxiedFetch = createProxiedFetch(env, fetchFn);
  const sections = await Promise.all(SECTION_URLS.map((url) => scrapeSection(proxiedFetch, url)));

  return {
    description: "News, in depth, the work and the knowledge from Campaign UK",
    entries: mergeEntries(sections),
    id: SITE_ORIGIN,
    language: "en",
    link: SITE_ORIGIN,
    title: "Campaign UK",
  };
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return scrape(ctx.env);
}
