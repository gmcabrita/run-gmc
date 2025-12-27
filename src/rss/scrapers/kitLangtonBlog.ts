import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("[data-column] a.hover\\:text-yellow-400[href^='/posts/']", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) {
          currentEntry = {
            id: "",
            link: "",
            title: "",
            text: "",
          };
          const link = new URL(href, "https://www.kitlangton.com").href;
          currentEntry.id = link;
          currentEntry.link = link;
          entries.push(currentEntry);
        }
      },
    })
    .on("[data-column] a.hover\\:text-yellow-400[href^='/posts/'] > div:first-child", {
      text(text) {
        if (currentEntry && text.text) {
          currentEntry.title = (currentEntry.title || "") + text.text;
        }
      },
    })
  await consume(rewriter.transform(response).body!);
  return {
    id: "https://www.kitlangton.com/",
    link: "https://www.kitlangton.com/",
    title: "Kit Langton",
    description: "Kit Langton",
    language: "en",
    entries: entries
      .map((entry) => {
        const title = entry.title.trim().replace(/\n/g, " | ");
        return {
          ...entry,
          title,
          text: title,
        };
      })
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch("https://www.kitlangton.com/", {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
