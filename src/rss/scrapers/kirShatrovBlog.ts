import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter().on("a[href^='/posts/']", {
    element(el) {
      const href = el.getAttribute("href");
      if (href && href.startsWith("/posts/")) {
        const link = new URL(href, "https://kirshatrov.com").href;
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
    id: "https://kirshatrov.com/posts/",
    link: "https://kirshatrov.com/posts/",
    title: "Kir Shatrov",
    description: "Kir Shatrov",
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
  const response = await fetch("https://kirshatrov.com/posts/", {
    redirect: "follow",
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
