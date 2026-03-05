import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://thewaltdisneycompany.com/press-releases/";

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on(".component-article-filter .article-filter-results article.twdcus-card", {
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
    .on(".component-article-filter .article-filter-results article.twdcus-card .twdcus-card__title a", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const href = el.getAttribute("href");
        if (href) {
          const link = new URL(href, BASE_URL).toString();
          currentEntry.id = link;
          currentEntry.link = link;
        }
      },
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;

        if (text.lastInTextNode) {
          const normalizedTitle = currentEntry.title.replace(/\s+/g, " ").trim();
          currentEntry.title = normalizedTitle;
          currentEntry.text = normalizedTitle;
        }
      },
    })
    .on(".component-article-filter .article-filter-results article.twdcus-card time.twdcus-card__date", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const datetime = el.getAttribute("datetime");
        if (!datetime) {
          return;
        }

        const parsedDate = new Date(datetime);
        if (!Number.isNaN(parsedDate.getTime())) {
          currentEntry.datetime = parsedDate;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (body) {
    await consume(body);
  }

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Press Release Archives | The Walt Disney Company",
    description: "Find announcements and updates from The Walt Disney Company and explore our archive of press releases.",
    language: "en",
    entries: entries.filter((entry) => isValidRSSEntry(entry)),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
