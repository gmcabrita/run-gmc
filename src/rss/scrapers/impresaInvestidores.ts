import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".wrapper-news", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
        });
      },
    })
    .on(".wrapper-news h1.title a", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          lastEntry.id = href;
          lastEntry.link = href;
        }
      },
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".wrapper-news .publishedDate", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const datetime = el.getAttribute("datetime");
        if (lastEntry && datetime) {
          lastEntry.datetime = new Date(datetime);
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    id: "https://www.impresa.pt/pt/investidores",
    link: "https://www.impresa.pt/pt/investidores",
    title: "Impresa – Investidores",
    description: "Impresa – Investidores",
    language: "pt",
    entries: entries
      .map((entry) => ({
        ...entry,
        title: entry.title.trim().replace(/\n/g, " | "),
        text: entry.title.trim().replace(/\n/g, " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(
    "https://www.impresa.pt/api/molecule/category/pt/investidores?types=MEDIA&limit=50",
    {
      headers: {
        "user-agent": USERAGENT,
        "Content-Type": "text/html",
      },
    },
  );

  return parse(response);
}
