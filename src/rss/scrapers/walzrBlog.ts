import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter().on("a.post[href*='/blog/']", {
    element(el) {
      const href = el.getAttribute("href");
      if (href) {
        const link = new URL(href, "https://walzr.com").href;
        entries.push({
          id: link,
          link: link,
          title: "",
          text: "",
        });
      }
    },
    text(text) {
      const lastEntry = entries[entries.length - 1];
      if (lastEntry && text.text) {
        lastEntry.title = (lastEntry.title || "") + text.text;
      }
    },
  });

  await consume(rewriter.transform(response).body!);
  return {
    id: "https://walzr.com/",
    link: "https://walzr.com/",
    title: "Riley Walz",
    description: "Riley Walz",
    language: "en",
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
  const response = await fetch("https://walzr.com/", {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
