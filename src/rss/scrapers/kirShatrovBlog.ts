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
    description: "Kir Shatrov",
    entries: entries
      .map((entry) => ({
        ...entry,
        text: entry.title.trim().replaceAll("\n", " | "),
        title: entry.title.trim().replaceAll("\n", " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://kirshatrov.com/posts/",
    language: "en",
    link: "https://kirshatrov.com/posts/",
    title: "Kir Shatrov",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://kirshatrov.com/posts/", {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
    redirect: "follow",
  });

  return parse(response);
}
