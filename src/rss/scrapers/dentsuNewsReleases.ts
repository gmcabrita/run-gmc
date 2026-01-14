import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.group.dentsu.com/en/news/release";

function parseDate(dateStr: string): Date | undefined {
  // Format: "Dec 25, 2025" or "Dec  2, 2025" (with extra space for single-digit days)
  const normalized = dateStr.replace(/\s+/g, " ").trim();
  const parsed = new Date(normalized);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return undefined;
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;
  let inDateElement = false;
  let inTitleElement = false;

  const rewriter = new HTMLRewriter()
    .on("ul.list-date > li > a", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) {
          const link = href.startsWith("http") ? href : `https://www.group.dentsu.com${href}`;
          currentEntry = {
            id: link,
            link: link,
            title: "",
            text: "",
          };
          entries.push(currentEntry);
        }
      },
    })
    .on("ul.list-date > li > a p.txt-date", {
      element() {
        inDateElement = true;
      },
      text(text) {
        if (currentEntry && inDateElement && text.text) {
          const date = parseDate(text.text);
          if (date) {
            currentEntry.datetime = date;
          }
        }
        if (text.lastInTextNode) {
          inDateElement = false;
        }
      },
    })
    .on("ul.list-date > li > a p.txt", {
      element() {
        inTitleElement = true;
      },
      text(text) {
        if (currentEntry && inTitleElement && text.text) {
          currentEntry.title += text.text;
          currentEntry.text = currentEntry.title;
        }
        if (text.lastInTextNode) {
          inTitleElement = false;
        }
      },
    });

  await consume(rewriter.transform(response).body!);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "News Releases - Dentsu Group Inc.",
    description: "News Releases from Dentsu Group",
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
