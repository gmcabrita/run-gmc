import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on(String.raw`[data-column] a.hover\:text-yellow-400[href^='/posts/']`, {
      element(el) {
        const href = el.getAttribute("href");
        if (href) {
          currentEntry = {
            id: "",
            link: "",
            text: "",
            title: "",
          };
          const link = new URL(href, "https://www.kitlangton.com").href;
          currentEntry.id = link;
          currentEntry.link = link;
          entries.push(currentEntry);
        }
      },
    })
    .on(String.raw`[data-column] a.hover\:text-yellow-400[href^='/posts/'] > div:first-child`, {
      text(text) {
        if (currentEntry && text.text) {
          currentEntry.title = (currentEntry.title || "") + text.text;
        }
      },
    })
  await consume(rewriter.transform(response).body!);
  return {
    description: "Kit Langton",
    entries: entries
      .map((entry) => {
        const title = entry.title.trim().replaceAll('\n', " | ");
        return {
          ...entry,
          text: title,
          title,
        };
      })
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://www.kitlangton.com/",
    language: "en",
    link: "https://www.kitlangton.com/",
    title: "Kit Langton",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://www.kitlangton.com/", {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
