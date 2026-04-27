import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.agendalx.pt";
const PDF_URL_PATTERN = /https:\/\/[^\s"'<>]+\.pdf/g;

export async function parse(response: Response): Promise<RSSData> {
  const now = new Date();
  const entries: RSSEntry[] = [];
  const html = await response.text();

  for (const match of html.matchAll(PDF_URL_PATTERN)) {
    const url = match[0];

    entries.push({
      id: url,
      link: url,
      title: url,
      text: url,
      datetime: now,
    });
  }

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "AgendaLX",
    description: "AgendaLX",
    language: "pt",
    entries: entries.filter(isValidRSSEntry),
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
