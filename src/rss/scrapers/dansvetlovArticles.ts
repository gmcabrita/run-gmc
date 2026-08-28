import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://dansvetlov.me/articles/";
const SITE_ORIGIN = "https://dansvetlov.me";
const DESCRIPTION =
  "I enjoy spending time yak shaving a little too much, and at some point, I realized that my personal notes documenting the architecture, design decisions, and implementation details of popular software might be interesting to others. Thus, this blog was born.";

interface DansvetlovDraftEntry extends RSSEntry {
  publishedAt: string;
  summary: string;
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function parsePublishedAt(value: string): Date | undefined {
  const normalized = normalizeWhitespace(value);
  if (normalized === "") {
    return undefined;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<DansvetlovDraftEntry> = [];
  let currentEntry: DansvetlovDraftEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("main article", {
      element() {
        currentEntry = {
          id: "",
          link: "",
          publishedAt: "",
          summary: "",
          text: "",
          title: "",
        };
        entries.push(currentEntry);
      },
    })
    .on("main article h3 > a[href^='/']", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const href = el.getAttribute("href");
        if (!href) {
          return;
        }

        const link = new URL(href, SITE_ORIGIN).toString();
        currentEntry.id = link;
        currentEntry.link = link;
      },
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;
      },
    })
    .on("main article time", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        currentEntry.publishedAt = el.getAttribute("datetime") ?? "";
      },
    })
    .on("main article p", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.summary += text.text;
      },
    })
    .on("main article > div > a[href^='/'] > img", {
      element(el) {
        if (!currentEntry || currentEntry.imageURL) {
          return;
        }

        const src = el.getAttribute("src");
        if (!src) {
          return;
        }

        currentEntry.imageURL = new URL(src, SITE_ORIGIN).toString();
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
        const summary = normalizeWhitespace(entry.summary);
        return {
          datetime: parsePublishedAt(entry.publishedAt),
          id: entry.id,
          imageURL: entry.imageURL,
          link: entry.link,
          text: summary || title,
          title,
        };
      })
      .filter(isValidRSSEntry),
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Articles | dansvetlov.me",
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
