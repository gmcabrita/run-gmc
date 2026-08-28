import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter().on(".container ul li a", {
    element(el) {
      const href = el.getAttribute("href");
      if (href && href.endsWith(".html") && href.startsWith("20")) {
        const link = new URL(href, "https://code.jeremyevans.net").href;
        entries.push({
          id: link,
          link: link,
          text: "",
          title: "",
        });
      }
    },
    text(text) {
      const lastEntry = entries.at(-1);
      if (lastEntry && text.text) {
        lastEntry.title = (lastEntry.title || "") + text.text;
      }
    },
  });

  await consume(rewriter.transform(response).body!);
  return {
    description: "Jeremy Evans",
    entries: entries
      .map((entry) => ({
        ...entry,
        text: entry.title.trim().replaceAll("\n", " | "),
        title: entry.title.trim().replaceAll("\n", " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://code.jeremyevans.net/",
    language: "en",
    link: "https://code.jeremyevans.net/",
    title: "Jeremy Evans",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://code.jeremyevans.net/", {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
