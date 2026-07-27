import {
  USERAGENT,
  consume,
  decodeHtmlEntities,
  isValidRSSEntry,
  type ScraperContext,
} from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://antibot.blog/";
const DESCRIPTION = "A blog for reverse engineering code!";

interface AntibotBlogDraftEntry extends RSSEntry {
  text: string;
  publishedAt: string;
}

function normalizeHtmlText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function parsePublishedAt(value: string): Date | undefined {
  const match = value.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (!match) {
    return undefined;
  }

  const [, monthValue, dayValue, yearValue] = match;
  if (!monthValue || !dayValue || !yearValue) {
    return undefined;
  }

  const month = Number.parseInt(monthValue, 10);
  const day = Number.parseInt(dayValue, 10);
  const year = Number.parseInt(yearValue, 10);
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

export async function parse(response: Response): Promise<RSSData> {
  const entries: AntibotBlogDraftEntry[] = [];
  let currentEntry: AntibotBlogDraftEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("main article", {
      element() {
        currentEntry = {
          id: "",
          link: "",
          title: "",
          text: "",
          publishedAt: "",
        };
        entries.push(currentEntry);
      },
    })
    .on("main article > a[href^='/posts/']", {
      element(element) {
        if (!currentEntry) {
          return;
        }

        const href = element.getAttribute("href");
        if (!href) {
          return;
        }

        const link = new URL(href, BASE_URL).toString();
        currentEntry.id = link;
        currentEntry.link = link;
      },
    })
    .on("main article h2", {
      text(text) {
        if (currentEntry) {
          currentEntry.title += text.text;
        }
      },
    })
    .on("main article > a[href^='/posts/'] > div", {
      text(text) {
        if (currentEntry) {
          currentEntry.publishedAt += text.text;
        }
      },
    })
    .on("main article > a[href^='/posts/'] > p", {
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
    id: BASE_URL,
    link: BASE_URL,
    title: "antibot.blog",
    description: DESCRIPTION,
    language: "en",
    entries: entries
      .map((entry) => ({
        id: entry.id,
        link: entry.link,
        title: normalizeHtmlText(entry.title),
        text: normalizeHtmlText(entry.text),
        datetime: parsePublishedAt(entry.publishedAt),
      }))
      .filter(isValidRSSEntry)
      .sort((a, b) => {
        const aTime = a.datetime?.getTime() ?? 0;
        const bTime = b.datetime?.getTime() ?? 0;
        return bTime - aTime;
      }),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    redirect: "follow",
    headers: {
      "user-agent": USERAGENT,
      accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${BASE_URL}: ${response.status} ${response.statusText}`);
  }

  return parse(response);
}
