import { USERAGENT, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.ccpj.pt";
const BASE_ORIGIN = "https://www.ccpj.pt";

interface CcpjDraftEntry extends RSSEntry {
  category: string;
  datetimeAttr: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseCcpjDatetimeAttr(datetimeAttr: string): Date | undefined {
  const match = datetimeAttr
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);

  if (!match) {
    return undefined;
  }

  const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match;

  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const hour = Number(hourStr ?? "0");
  const minute = Number(minuteStr ?? "0");
  const second = Number(secondStr ?? "0");

  if (![day, month, year, hour, minute, second].every(Number.isFinite)) {
    return undefined;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return undefined;
  }

  return new Date(year, month - 1, day, hour, minute, second);
}

function hasRequiredFields(entry: RSSEntry): boolean {
  return Boolean(entry.id && entry.link && entry.title);
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: CcpjDraftEntry[] = [];

  const rewriter = new HTMLRewriter()
    .on("#frontpage-news article.article-item", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
          category: "",
          datetimeAttr: "",
        });
      },
    })
    .on("#frontpage-news article.article-item span.category", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.category += text.text;
        }
      },
    })
    .on("#frontpage-news article.article-item h1.article-item-title > a", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, BASE_ORIGIN).href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title += text.text;
        }
      },
    })
    .on("#frontpage-news article.article-item time", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const datetimeAttr = el.getAttribute("datetime");
        if (lastEntry && datetimeAttr) {
          lastEntry.datetimeAttr = datetimeAttr;
        }
      },
    });

  const transformed = rewriter.transform(response);
  if (!transformed.body) {
    throw new Error("Missing response body");
  }
  await consume(transformed.body);

  const rssEntries: RSSEntry[] = entries
    .map((entry) => {
      const category = normalizeWhitespace(entry.category);
      const text = category ? `<strong>Categoria:</strong> ${category}` : "";

      return {
        id: entry.id,
        link: entry.link,
        title: normalizeWhitespace(entry.title),
        text,
        datetime: entry.datetimeAttr ? parseCcpjDatetimeAttr(entry.datetimeAttr) : undefined,
      };
    })
    .filter(hasRequiredFields);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "CCPJ - Destaques",
    description: "CCPJ - Destaques",
    language: "pt",
    entries: rssEntries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
      accept: "text/html",
    },
  });

  return parse(response);
}
