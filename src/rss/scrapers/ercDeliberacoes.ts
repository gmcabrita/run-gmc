import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".item article", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
        });
      },
    })
    .on(".item article h1.item__title", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".item article .item__desc", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.text = (lastEntry.text || "") + text.text;
        }
      },
    })
    .on(".item article .item__options a[title='Download']", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, "https://www.erc.pt").href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
    });

  await consume(rewriter.transform(response).body!);
  return {
    id: "https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/",
    link: "https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/",
    title: "Deliberações ERC",
    description: "Deliberações ERC",
    language: "pt",
    entries: entries
      .map((entry) => {
        let text = entry.text?.trim().replace(/\s+/g, " ") || "";
        // Handle both decoded "Tópicos:" and HTML entity encoded "T&oacute;picos:"
        const topicsPatterns = ["Tópicos:", "T&oacute;picos:"];
        for (const pattern of topicsPatterns) {
          const topicsIndex = text.indexOf(pattern);
          if (topicsIndex !== -1) {
            text = text.substring(0, topicsIndex).trim();
            break;
          }
        }
        return {
          ...entry,
          title: entry.title.trim().replace(/\n/g, " | "),
          text,
        };
      })
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch("https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/", {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
