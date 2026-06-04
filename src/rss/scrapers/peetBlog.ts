import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://blog.peet.ws/";
const TITLE = "Peter Pagenstedt";
const DESCRIPTION = "notes on software, systems, and captchas";

interface PeetBlogDraftEntry extends RSSEntry {
  dateText: string;
  description: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parsePublishedAt(value: string): Date | undefined {
  const match = normalizeWhitespace(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return undefined;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: PeetBlogDraftEntry[] = [];
  let currentEntry: PeetBlogDraftEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("main li", {
      element() {
        currentEntry = {
          id: "",
          link: "",
          title: "",
          text: "",
          dateText: "",
          description: "",
        };
        entries.push(currentEntry);
      },
    })
    .on("main li a", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const href = el.getAttribute("href");
        if (!href) {
          return;
        }

        const link = new URL(href, BASE_URL).toString();
        currentEntry.id = link;
        currentEntry.link = link;
      },
    })
    .on("main li time", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const dateTime = el.getAttribute("datetime");
        if (dateTime) {
          currentEntry.dateText = dateTime;
        }
      },
      text(text) {
        if (!currentEntry || currentEntry.dateText !== "") {
          return;
        }

        currentEntry.dateText += text.text;
      },
    })
    .on("main li h2", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;
      },
    })
    .on("main li p", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.description += text.text;
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing response body");
  }
  await consume(body);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: TITLE,
    description: DESCRIPTION,
    language: "en",
    entries: entries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        const description = normalizeWhitespace(entry.description);
        const dateText = normalizeWhitespace(entry.dateText);
        return {
          id: entry.id,
          link: entry.link,
          title,
          text: description,
          datetime: parsePublishedAt(dateText),
        };
      })
      .filter(isValidRSSEntry),
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
