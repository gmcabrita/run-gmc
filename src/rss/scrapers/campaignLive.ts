import { consume, decodeHtmlEntities, type ScraperContext, WHATSAPP_USER_AGENT } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";

const SITE_ORIGIN = "https://www.campaignlive.co.uk";
const SECTION_URLS = [`${SITE_ORIGIN}/news`];
// Campaign sits behind Cloudflare and an Azure WAF JS challenge. Cloudflare
// challenges requests from Worker IPs, so requests go through the relay with
// its browser TLS fingerprint. Azure WAF challenges browser User-Agents from
// the relay, but lets the WhatsApp link preview client through.
const REQUEST_HEADERS = {
  Accept: "text/html",
  "User-Agent": WHATSAPP_USER_AGENT,
};
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

async function scrapeSection(fetchFn: typeof fetch, url: string): Promise<Array<RSSEntry>> {
  const response = await fetchFn(url, { headers: REQUEST_HEADERS });

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

export async function scrape(
  env: ProxiedFetchEnv,
  fetchFn: typeof fetch = fetch,
): Promise<RSSData> {
  const proxiedFetch = createProxiedFetch(env, fetchFn);
  const sections = await Promise.all(SECTION_URLS.map((url) => scrapeSection(proxiedFetch, url)));

  return {
    description: "News from Campaign UK",
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
