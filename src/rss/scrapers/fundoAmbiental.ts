import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.fundoambiental.pt/listagem-noticias.aspx";

function parseDateFundoAmbiental(dateString: string): Date {
  const dateStr = dateString.replaceAll("-", "");
  return new Date(`${dateStr.slice(4, 8)}-${dateStr.slice(2, 4)}-${dateStr.slice(0, 2)}`);
}

interface FundoAmbientalEntry extends RSSEntry {
  dateString: string;
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: FundoAmbientalEntry[] = [];

  const rewriter = new HTMLRewriter()
    .on(".register", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
          dateString: "",
        });
      },
    })
    .on(".register .register-title", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title = (lastEntry.title || "") + text.text;
        }
      },
    })
    .on(".register .register-title > a", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          lastEntry.id = href;
          lastEntry.link = href;
        }
      },
    })
    .on(".register .register-text", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.text = (lastEntry.text || "") + text.text;
        }
      },
    })
    .on(".register .register-date", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.dateString = (lastEntry.dateString || "") + text.text;
        }
      },
    });

  await consume(rewriter.transform(response).body!);

  const rssEntries: RSSEntry[] = entries.map((entry) => ({
    id: entry.id,
    link: entry.link,
    title: entry.title.trim(),
    text: (entry.text ?? "").trim(),
    datetime: parseDateFundoAmbiental(entry.dateString),
  }));

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Fundo Ambiental – Últimas notícias",
    description: "Fundo Ambiental – Últimas notícias",
    language: "pt",
    entries: rssEntries.filter(isValidRSSEntry),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
