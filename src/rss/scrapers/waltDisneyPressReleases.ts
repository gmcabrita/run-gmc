import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".press-releases-container > article", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
        });
      },
    })
    .on(".press-releases-container > article h2 a", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const link = el.getAttribute("href")!;
        if (lastEntry && link) {
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title += text.text;
          lastEntry.text += text.text;
        }
      },
    })
    .on(".press-releases-container > article time", {
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
    id: "https://thewaltdisneycompany.com/press-releases/",
    link: "https://thewaltdisneycompany.com/press-releases/",
    title: "Press Releases Archives - The Walt Disney Company",
    description: "Press Releases Archives - The Walt Disney Company",
    language: "en",
    entries: entries.filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch("https://thewaltdisneycompany.com/press-releases/", {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
