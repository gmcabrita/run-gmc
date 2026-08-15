import { decodeHtmlEntities, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";

const BASE_URL = "https://www.ft.com/media";
const FT_ORIGIN = "https://www.ft.com";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

function getAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(new RegExp(`(?:^|\\s)${escapedName}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2];
}

function hasClass(attributes: string, className: string): boolean {
  return getAttribute(attributes, "class")?.split(/\s+/).includes(className) ?? false;
}

function normalizeText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCanonicalArticleUrl(href: string): string | undefined {
  try {
    const url = new URL(decodeHtmlEntities(href), FT_ORIGIN);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.ft.com" ||
      !/^\/content\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
        url.pathname,
      )
    ) {
      return undefined;
    }

    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function getImageUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(decodeHtmlEntities(value));
    return url.protocol === "https:" && url.hostname === "images.ft.com" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function findHeading(chunk: string): { href: string; title: string } | undefined {
  for (const match of chunk.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (getAttribute(match[1], "data-trackable") !== "heading-link") {
      continue;
    }

    const href = getAttribute(match[1], "href");
    const title = normalizeText(match[2]);
    if (href && title) {
      return { href, title };
    }
  }

  return undefined;
}

function findStandfirst(chunk: string): string | undefined {
  for (const match of chunk.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    if (!hasClass(match[1], "o-teaser__standfirst")) {
      continue;
    }

    return normalizeText(match[2]) || undefined;
  }

  return undefined;
}

function findDatetime(chunk: string): Date | undefined {
  for (const match of chunk.matchAll(/<time\b([^>]*)>/gi)) {
    const datetime = parseDate(getAttribute(match[1], "datetime"));
    if (datetime) {
      return datetime;
    }
  }

  return undefined;
}

function findImage(chunk: string): string | undefined {
  for (const match of chunk.matchAll(/<img\b([^>]*)>/gi)) {
    if (!hasClass(match[1], "o-teaser__image")) {
      continue;
    }

    return getImageUrl(
      getAttribute(match[1], "data-src") ?? getAttribute(match[1], "src"),
    );
  }

  return undefined;
}

function findStreamList(html: string): string {
  for (const match of html.matchAll(/<ul\b([^>]*)>/gi)) {
    if (!/(?:^|\s)data-stream-list(?:\s|=|$)/i.test(match[1])) {
      continue;
    }

    const contentStart = (match.index ?? 0) + match[0].length;
    let depth = 1;

    for (const tag of html.slice(contentStart).matchAll(/<\/?ul\b[^>]*>/gi)) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        return html.slice(contentStart, contentStart + (tag.index ?? 0));
      }
    }
  }

  throw new Error("Missing FT media stream");
}

function getStreamItems(streamList: string): string[] {
  const starts = [...streamList.matchAll(/<li\b([^>]*)>/gi)].filter(
    (match) =>
      hasClass(match[1], "o-teaser-collection__item") && hasClass(match[1], "o-grid-row"),
  );

  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? streamList.length;
    return streamList.slice(start, end);
  });
}

function parseStreamItem(chunk: string): RSSEntry | undefined {
  const heading = findHeading(chunk);
  if (!heading) {
    return undefined;
  }

  const link = getCanonicalArticleUrl(heading.href);
  if (!link) {
    return undefined;
  }

  return {
    id: link,
    link,
    title: heading.title,
    text: findStandfirst(chunk) ?? heading.title,
    datetime: findDatetime(chunk),
    imageURL: findImage(chunk),
  };
}

export function parse(html: string): RSSData {
  const seenLinks = new Set<string>();
  const entries = getStreamItems(findStreamList(html))
    .flatMap((chunk) => {
      const entry = parseStreamItem(chunk);
      if (!entry || seenLinks.has(entry.link)) {
        return [];
      }

      seenLinks.add(entry.link);
      return [entry];
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Financial Times - Media",
    description: "Media news, analysis and opinion from the Financial Times",
    language: "en",
    entries,
  };
}

function getRequestHeaders(): HeadersInit {
  return {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Sec-CH-UA": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"macOS"',
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    Priority: "u=0, i",
  };
}

export async function scrape(
  env: ProxiedFetchEnv,
  fetcher: typeof fetch = fetch,
): Promise<RSSData> {
  const response = await createProxiedFetch(env, fetcher)(BASE_URL, {
    headers: getRequestHeaders(),
  });

  if (!response.ok) {
    throw new Error(`FT media request failed: ${response.status}`);
  }

  return parse(await response.text());
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return scrape(ctx.env);
}
