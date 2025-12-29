import xml2js from "xml2js";
import { USERAGENT, isValidRSSEntry } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { AnteEstreiasRssParsed } from "@types";

const BASE_URL = "https://ante-estreias.blogs.sapo.pt";
const API_URL = "https://ante-estreias.blogs.sapo.pt/data/rss";

export async function parse(xmlText: string): Promise<RSSData> {
  const result = await xml2js.parseStringPromise(xmlText);
  const parsedResult = result as AnteEstreiasRssParsed;

  const filteredItems = parsedResult.rss.channel[0].item.filter((item) => {
    const categories = item.category || [];
    return categories.length === 1 && categories[0] === "- bilhetes cinema";
  });

  const entries: RSSEntry[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const firstATagRegex = /<a[^>]*title=["']([^"']+)["'][^>]*>/i;

  for (const item of filteredItems) {
    const description = item.description[0];
    let trMatch;

    while ((trMatch = trRegex.exec(description)) !== null) {
      const trContent = trMatch[1];
      const firstATagMatch = trContent.match(firstATagRegex);

      let movieTitle = "";
      if (firstATagMatch && firstATagMatch[1]) {
        movieTitle = firstATagMatch[1].trim();
      }

      const urlRegex = /<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
      let urlMatch;

      while ((urlMatch = urlRegex.exec(trContent)) !== null) {
        const url = urlMatch[1];

        if (!url.includes("ante-estreias.blogs.sapo.pt")) {
          entries.push({
            id: url,
            link: url,
            title: movieTitle || url,
            text: url,
            datetime: new Date(item.pubDate[0]),
          });
        }
      }
    }
  }

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Ante-Estreias Cinema",
    description: "External URLs extracted from Ante-Estreias bilhetes cinema posts",
    language: "pt",
    entries: entries.filter(isValidRSSEntry),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const xmlText = await response.text();
  return parse(xmlText);
}
