import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".news__article > article", {
      element() {
        entries.push({
          id: "",
          link: "",
          text: "",
          title: "",
        });
      },
    })
    .on(".news__article > article a.news__article__title", {
      element(el) {
        const lastEntry = entries.at(-1);
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
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.title += text.text;
        }
      },
    })
    .on(".news__article > article div > p", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.text = (lastEntry.text || "") + text.text;
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    description: "Noticias ERC",
    entries: entries
      .map((entry) => ({
        ...entry,
        text: entry.text?.trim().replaceAll("\n", " | "),
        title: entry.title.trim().replaceAll("\n", " | "),
      }))
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: "https://www.erc.pt/pt/a-erc/noticias/",
    language: "pt",
    link: "https://www.erc.pt/pt/a-erc/noticias/",
    title: "Noticias ERC",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://www.erc.pt/pt/a-erc/noticias/", {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
