import XPath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import { USERAGENT, isValidRSSEntry } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.agendalx.pt";

export async function parse(html: string): Promise<RSSData> {
  const domParser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: (err) => {
        throw new Error(err);
      },
    },
  });

  const document = domParser.parseFromString(html, "text/xml");
  const hrefs = XPath.select("//a[contains(string(@href), '.pdf')]/@href", document) as Attr[];

  const now = new Date();
  const entries: RSSEntry[] = hrefs.map((href) => ({
    id: href.value,
    link: href.value,
    title: href.value,
    text: href.value,
    datetime: now,
  }));

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "AgendaLX",
    description: "AgendaLX",
    language: "pt",
    entries: entries.filter(isValidRSSEntry),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const html = await response.text();
  return parse(html);
}
