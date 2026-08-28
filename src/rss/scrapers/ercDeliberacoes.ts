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

function parsePublicationDate(text: string): Date | undefined {
  const match = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!match) {
    return undefined;
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  const optionTexts: Array<string> = [];
  const rewriter = new HTMLRewriter()
    .on(".item article", {
      element() {
        entries.push({
          id: "",
          link: "",
          text: "",
          title: "",
        });
        optionTexts.push("");
      },
    })
    .on(".item article h1.item__title", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".item article .item__desc", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.text = (lastEntry.text || "") + text.text;
        }
      },
    })
    .on(".item article .item__options", {
      text(text) {
        const lastIndex = optionTexts.length - 1;
        if (lastIndex >= 0) {
          optionTexts[lastIndex] += text.text;
        }
      },
    })
    .on(".item article .item__options a[title='Download']", {
      element(el) {
        const lastEntry = entries.at(-1);
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
    description: "Deliberações ERC",
    entries: entries
      .map((entry, index) => {
        let text = entry.text?.trim().replaceAll(/\s+/g, " ") || "";
        // Handle both decoded "Tópicos:" and HTML entity encoded "T&oacute;picos:"
        const topicsPatterns = ["Tópicos:", "T&oacute;picos:"];
        for (const pattern of topicsPatterns) {
          const topicsIndex = text.indexOf(pattern);
          if (topicsIndex !== -1) {
            text = text.slice(0, topicsIndex).trim();
            break;
          }
        }
        return {
          ...entry,
          datetime: parsePublicationDate(optionTexts[index] ?? ""),
          text,
          title: entry.title.trim().replaceAll("\n", " | "),
        };
      })
      .filter((entry: RSSEntry) => isValidRSSEntry(entry)),
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Deliberações ERC",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(buildRequestUrl(), {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
