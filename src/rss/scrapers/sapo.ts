import xml2js from "xml2js";
import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { SapoRssItem, SapoRssParsed } from "@types";

const BASE_URL = "https://sapo.pt/";
const API_URL = "https://sapo.pt/rss";

function getImageUrl(item: SapoRssItem): string | undefined {
  const enclosureUrl = item.enclosure?.[0]?.$?.url;
  if (enclosureUrl) {
    return enclosureUrl;
  }

  return item["media:content"]?.[0]?.$?.url;
}

function parseItem(item: SapoRssItem): RSSEntry | undefined {
  const link = item.link?.[0]?.trim();
  const title = item.title?.[0]?.trim();
  const id = item.guid?.[0]?.trim() || link;

  if (!id || !link || !title) {
    return undefined;
  }

  const pubDate = item.pubDate?.[0];
  const datetime = pubDate ? new Date(pubDate) : undefined;

  return {
    id,
    link,
    title,
    text: item.description?.[0]?.trim(),
    datetime: datetime && !Number.isNaN(datetime.getTime()) ? datetime : undefined,
    imageURL: getImageUrl(item),
  };
}

export async function parse(xmlText: string): Promise<RSSData> {
  const result = await xml2js.parseStringPromise(xmlText);
  const parsedResult = result as SapoRssParsed;
  const channel = parsedResult.rss.channel[0];

  const entries = (channel.item ?? [])
    .map(parseItem)
    .filter((entry): entry is RSSEntry => entry !== undefined)
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: channel.link?.[0] ?? BASE_URL,
    title: channel.title?.[0] ?? "SAPO",
    description: channel.description?.[0],
    language: "pt",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const xmlText = await response.text();
  return parse(xmlText);
}
