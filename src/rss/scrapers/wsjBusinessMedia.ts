import { USERAGENT, decodeHtmlEntities, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.wsj.com/business/media";
const FEED_URL = "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness";
const MEDIA_ARTICLE_PATH_PREFIXES = ["/business/media/", "/cmo-today/"] as const;

function decodeXmlText(value: string): string {
  const trimmed = value.trim();
  const unwrapped =
    trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")
      ? trimmed.slice("<![CDATA[".length, -"]]>".length)
      : trimmed;

  return decodeHtmlEntities(unwrapped);
}

function tagText(xml: string, tagName: string): string | undefined {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(xml);
  const value = match?.[1];
  return value === undefined ? undefined : decodeXmlText(value);
}

function tagAttribute(xml: string, tagName: string, attributeName: string): string | undefined {
  const tag = new RegExp(`<${tagName}\\b([^>]*)>`, "i").exec(xml)?.[1];
  if (!tag) {
    return undefined;
  }

  const value = new RegExp(`(?:^|\\s)${attributeName}=(['"])(.*?)\\1`, "i").exec(tag)?.[2];
  return value === undefined ? undefined : decodeXmlText(value);
}

function normalizeText(value: string): string {
  return value.replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim();
}

function getCanonicalArticleUrl(value: string): string | undefined {
  try {
    const url = new URL(normalizeText(value));
    const isMediaArticle = MEDIA_ARTICLE_PATH_PREFIXES.some((prefix) =>
      url.pathname.startsWith(prefix),
    );
    if (url.protocol !== "https:" || url.hostname !== "www.wsj.com" || !isMediaArticle) {
      return undefined;
    }

    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function parseDatetime(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const datetime = new Date(value);
  return Number.isNaN(datetime.getTime()) ? undefined : datetime;
}

function parseItem(itemXml: string): RSSEntry | undefined {
  const link = getCanonicalArticleUrl(tagText(itemXml, "link") ?? "");
  const title = normalizeText(tagText(itemXml, "title") ?? "");
  if (!link || !title) {
    return undefined;
  }

  const description = normalizeText(tagText(itemXml, "description") ?? "");
  const entry: RSSEntry = {
    id: link,
    link,
    text: description || title,
    title,
  };
  const datetime = parseDatetime(tagText(itemXml, "pubDate"));
  const imageURL = tagAttribute(itemXml, "media:content", "url");

  if (datetime) {
    entry.datetime = datetime;
  }
  if (imageURL) {
    entry.imageURL = imageURL;
  }

  return isValidRSSEntry(entry) ? entry : undefined;
}

export function parse(xml: string): RSSData {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new Error("Invalid WSJ Business RSS feed");
  }

  const seenLinks = new Set<string>();
  const entries = Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)).flatMap(
    (match) => {
      const itemXml = match[1];
      const entry = itemXml === undefined ? undefined : parseItem(itemXml);
      if (!entry || seenLinks.has(entry.link)) {
        return [];
      }

      seenLinks.add(entry.link);
      return [entry];
    },
  );

  return {
    description: "Media news and analysis from The Wall Street Journal",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "WSJ - Business Media",
  };
}

export async function scrape(fetcher: typeof fetch = fetch): Promise<RSSData> {
  const response = await fetcher(FEED_URL, {
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9",
      "User-Agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`WSJ Business RSS request failed: ${response.status}`);
  }

  return parse(await response.text());
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  return scrape();
}
