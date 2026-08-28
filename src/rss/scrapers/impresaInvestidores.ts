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
          text: "",
          title: "",
        });
      },
    })
    .on(".wrapper-news h1.title a", {
      element(el) {
        const lastEntry = entries.at(-1);
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          lastEntry.id = href;
          lastEntry.link = href;
        }
      },
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".wrapper-news .publishedDate", {
      element(el) {
        const lastEntry = entries.at(-1);
        const datetime = el.getAttribute("datetime");
        if (lastEntry && datetime) {
          lastEntry.datetime = new Date(datetime);
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    description: "Impresa – Investidores",
    entries: entries
      .map((entry) => ({
        ...entry,
        text: entry.title.trim().replaceAll("\n", " | "),
        title: entry.title.trim().replaceAll("\n", " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://www.impresa.pt/pt/investidores",
    language: "pt",
    link: "https://www.impresa.pt/pt/investidores",
    title: "Impresa – Investidores",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(
    "https://www.impresa.pt/api/molecule/category/pt/investidores?types=MEDIA&limit=50",
    {
      headers: {
        "Content-Type": "text/html",
        "user-agent": USERAGENT,
      },
    },
  );

  return parse(response);
}
