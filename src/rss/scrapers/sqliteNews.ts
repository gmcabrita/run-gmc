import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const NEWS_URL = "https://www.sqlite.org/news.html";
const TITLE = "Recent SQLite News";
const DESCRIPTION = "Recent news from the SQLite project";

interface SQLiteNewsDraftEntry extends RSSEntry {
  heading: string;
  text: string;
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function parseDate(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const [, yearValue, monthValue, dayValue] = match;
  if (!yearValue || !monthValue || !dayValue) {
    return undefined;
  }

  const year = Number.parseInt(yearValue, 10);
  const month = Number.parseInt(monthValue, 10);
  const day = Number.parseInt(dayValue, 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function parseLink(href: string): string | undefined {
  try {
    return new URL(href, NEWS_URL).toString();
  } catch {
    return undefined;
  }
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<SQLiteNewsDraftEntry> = [];
  let currentEntry: SQLiteNewsDraftEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("h3", {
      element() {
        currentEntry = {
          heading: "",
          id: "",
          link: "",
          text: "",
          title: "",
        };
        entries.push(currentEntry);
      },
      text(text) {
        if (currentEntry) {
          currentEntry.heading += text.text;
        }
      },
    })
    .on("h3 a[href]", {
      element(element) {
        if (!currentEntry) {
          return;
        }

        const href = element.getAttribute("href");
        const link = href ? parseLink(href) : undefined;
        if (link) {
          currentEntry.id = link;
          currentEntry.link = link;
        }
      },
    })
    .on("blockquote", {
      text(text) {
        if (currentEntry) {
          currentEntry.text += text.text;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing response body");
  }
  await consume(body);

  return {
    description: DESCRIPTION,
    entries: entries
      .map((entry) => {
        const heading = normalizeWhitespace(entry.heading);
        const headingMatch = heading.match(/^(\d{4}-\d{2}-\d{2})\s+-\s+(.+)$/);
        if (!headingMatch) {
          return entry;
        }

        const [, dateText, title] = headingMatch;
        if (!dateText || !title) {
          return entry;
        }

        const fallbackLink = `${NEWS_URL}#${dateText.replaceAll("-", "_")}`;
        return {
          datetime: parseDate(dateText),
          heading: entry.heading,
          id: entry.id || fallbackLink,
          link: entry.link || fallbackLink,
          text: normalizeWhitespace(entry.text),
          title,
        };
      })
      .filter(isValidRSSEntry)
      .map(({ heading: _heading, ...entry }) => entry)
      .sort((a, b) => {
        const aTime = a.datetime?.getTime() ?? 0;
        const bTime = b.datetime?.getTime() ?? 0;
        return bTime - aTime;
      }),
    id: NEWS_URL,
    language: "en",
    link: NEWS_URL,
    title: TITLE,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(NEWS_URL, {
    headers: {
      accept: "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parse(response);
}
