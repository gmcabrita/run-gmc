import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.agendalx.pt";
const PDF_URL_PATTERN = /https:\/\/[^\s"'<>]+\.pdf/g;

export async function parse(response: Response): Promise<RSSData> {
  const now = new Date();
  const entries: Array<RSSEntry> = [];
  const html = await response.text();

  for (const match of html.matchAll(PDF_URL_PATTERN)) {
    const url = match[0];

    entries.push({
      datetime: now,
      id: url,
      link: url,
      text: url,
      title: url,
    });
  }

  return {
    description: "AgendaLX",
    entries: entries.filter(isValidRSSEntry),
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "AgendaLX",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
