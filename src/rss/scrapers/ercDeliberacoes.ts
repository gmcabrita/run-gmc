import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/";

export function buildRequestUrl(now: Date = new Date()): string {
  const targetMonth = now.getUTCMonth() - 3;
  const daysInTargetMonth = new Date(
    Date.UTC(now.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate();
  const dateFrom = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      targetMonth,
      Math.min(now.getUTCDate(), daysInTargetMonth),
    ),
  );
  const day = String(dateFrom.getUTCDate()).padStart(2, "0");
  const month = String(dateFrom.getUTCMonth() + 1).padStart(2, "0");
  const url = new URL(BASE_URL);

  url.searchParams.set("s", "1");
  url.searchParams.set("palavrasChave", "");
  url.searchParams.set("date_from", `${day}/${month}/${dateFrom.getUTCFullYear()}`);

  return url.href;
}

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
    id: BASE_URL,
    link: BASE_URL,
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

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(buildRequestUrl(), {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
