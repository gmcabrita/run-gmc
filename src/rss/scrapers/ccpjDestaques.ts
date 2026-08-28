import { USERAGENT, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.ccpj.pt";
const BASE_ORIGIN = "https://www.ccpj.pt";

interface CcpjDraftEntry extends RSSEntry {
  category: string;
  datetimeAttr: string;
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

interface CcpjDateParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

function readCcpjDateParts(match: RegExpMatchArray): CcpjDateParts {
  const [, day, month, year, hour, minute, second] = match;
  return {
    day: Number(day),
    hour: Number(hour ?? "0"),
    minute: Number(minute ?? "0"),
    month: Number(month),
    second: Number(second ?? "0"),
    year: Number(year),
  };
}

function hasValidCcpjDateParts(parts: CcpjDateParts): boolean {
  const { day, hour, minute, month, second, year } = parts;
  const allParts = [day, month, year, hour, minute, second];
  const hasValidDate = month >= 1 && month <= 12 && day >= 1 && day <= 31;
  const hasValidTime =
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
  return allParts.every(Number.isFinite) && hasValidDate && hasValidTime;
}

function parseCcpjDatetimeAttr(datetimeAttr: string): Date | undefined {
  const match = datetimeAttr
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return undefined;
  }

  const parts = readCcpjDateParts(match);
  if (!hasValidCcpjDateParts(parts)) {
    return undefined;
  }

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function hasRequiredFields(entry: RSSEntry): boolean {
  return Boolean(entry.id && entry.link && entry.title);
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<CcpjDraftEntry> = [];

  const rewriter = new HTMLRewriter()
    .on("#frontpage-news article.article-item", {
      element() {
        entries.push({
          category: "",
          datetimeAttr: "",
          id: "",
          link: "",
          text: "",
          title: "",
        });
      },
    })
    .on("#frontpage-news article.article-item span.category", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.category += text.text;
        }
      },
    })
    .on("#frontpage-news article.article-item h1.article-item-title > a", {
      element(el) {
        const lastEntry = entries.at(-1);
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, BASE_ORIGIN).href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.title += text.text;
        }
      },
    })
    .on("#frontpage-news article.article-item time", {
      element(el) {
        const lastEntry = entries.at(-1);
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

  const rssEntries: Array<RSSEntry> = entries
    .map((entry) => {
      const category = normalizeWhitespace(entry.category);
      const text = category ? `<strong>Categoria:</strong> ${category}` : "";

      return {
        datetime: entry.datetimeAttr ? parseCcpjDatetimeAttr(entry.datetimeAttr) : undefined,
        id: entry.id,
        link: entry.link,
        text,
        title: normalizeWhitespace(entry.title),
      };
    })
    .filter(hasRequiredFields);

  return {
    description: "CCPJ - Destaques",
    entries: rssEntries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "CCPJ - Destaques",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      accept: "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
