import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://brokenbrowser.com/";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: RSSEntry[] = [];
  let currentEntry: RSSEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("article.post.on-list", {
      element() {
        currentEntry = {
          id: "",
          link: "",
          title: "",
          text: "",
        };
        entries.push(currentEntry);
      },
    })
    .on(".post-title a[href^='/blog/']", {
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
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;
        currentEntry.text += text.text;
      },
    })
    .on(".post-date time[datetime]", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const datetime = el.getAttribute("datetime");
        if (!datetime) {
          return;
        }

        const date = new Date(datetime);
        if (!Number.isNaN(date.getTime())) {
          currentEntry.datetime = date;
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
    title: "Broken Browser Blog",
    description: "Broken Browser blog posts",
    language: "en",
    entries: entries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        return {
          ...entry,
          title,
          text: title,
        };
      })
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

  return parse(response);
}
