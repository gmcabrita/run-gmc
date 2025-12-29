import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.agendalx.pt";

export async function parse(response: Response): Promise<RSSData> {
  const now = new Date();
  const entries: RSSEntry[] = [];

  const rewriter = new HTMLRewriter().on("a[href*='.pdf']", {
    element(el) {
      const href = el.getAttribute("href");
      if (href && href.includes(".pdf")) {
        entries.push({
          id: href,
          link: href,
          title: href,
          text: href,
          datetime: now,
        });
      }
    },
  });

  await consume(rewriter.transform(response).body!);

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

  return parse(response);
}
