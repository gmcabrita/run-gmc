import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://blog.azerpas.com/";
const DESCRIPTION =
  "Anthony Manikhouth — engineer writing about browser security, low-level performance, and weekend hardware experiments.";

interface AzerpasDraftEntry extends RSSEntry {
  metadata: string;
  tags: Array<string>;
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function parseMonth(month: string): number | undefined {
  switch (month) {
    case "Jan":
      return 0;
    case "Feb":
      return 1;
    case "Mar":
      return 2;
    case "Apr":
      return 3;
    case "May":
      return 4;
    case "Jun":
      return 5;
    case "Jul":
      return 6;
    case "Aug":
      return 7;
    case "Sep":
      return 8;
    case "Oct":
      return 9;
    case "Nov":
      return 10;
    case "Dec":
      return 11;
  }
}

function parsePublishedAt(value: string): Date | undefined {
  const dateMatch = normalizeWhitespace(value).match(/^(\d{4}) · ([A-Z][a-z]{2}) (\d{1,2})/);
  if (!dateMatch) {
    return undefined;
  }

  const [, yearValue, monthValue, dayValue] = dateMatch;
  if (!yearValue || !monthValue || !dayValue) {
    return undefined;
  }

  const year = Number.parseInt(yearValue, 10);
  const month = parseMonth(monthValue);
  const day = Number.parseInt(dayValue, 10);
  if (month === undefined || Number.isNaN(year) || Number.isNaN(day)) {
    return undefined;
  }

  return new Date(Date.UTC(year, month, day));
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<AzerpasDraftEntry> = [];
  let currentEntry: AzerpasDraftEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on(".post-list > li", {
      element() {
        currentEntry = {
          id: "",
          link: "",
          metadata: "",
          tags: [],
          title: "",
        };
        entries.push(currentEntry);
      },
    })
    .on(".post-list .post-link", {
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
    .on(".post-list .post-link .t", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;
      },
    })
    .on(".post-list .m", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.metadata += text.text;
      },
    })
    .on(".post-list .post-tags li", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        const tag = normalizeWhitespace(text.text);
        if (tag !== "") {
          currentEntry.tags.push(tag);
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
        const title = normalizeWhitespace(entry.title);
        const metadata = normalizeWhitespace(entry.metadata);
        const tags = entry.tags.join(" ");
        return {
          datetime: parsePublishedAt(metadata),
          id: entry.id,
          link: entry.link,
          text: [metadata, tags].filter((part) => part !== "").join(" · "),
          title,
        };
      })
      .filter(isValidRSSEntry),
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Anthony Manikhouth",
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
