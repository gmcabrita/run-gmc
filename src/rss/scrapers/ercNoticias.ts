import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".news__article > article", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
        });
      },
    })
    .on(".news__article > article a.news__article__title", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, "https://www.erc.pt").href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
    })
    .on(".news__article > article h1", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title += text.text;
        }
      },
    })
    .on(".news__article > article div > p", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.text = (lastEntry.text || "") + text.text;
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    id: "https://www.erc.pt/pt/a-erc/noticias/",
    link: "https://www.erc.pt/pt/a-erc/noticias/",
    title: "Noticias ERC",
    description: "Noticias ERC",
    language: "pt",
    entries: entries
      .map((entry) => ({
        ...entry,
        title: entry.title.trim().replace(/\n/g, " | "),
        text: entry.text?.trim().replace(/\n/g, " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch("https://www.erc.pt/pt/a-erc/noticias/", {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
