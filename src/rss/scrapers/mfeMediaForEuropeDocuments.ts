import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.mfemediaforeurope.com";
const PAGE_URL = `${BASE_URL}/view/document_search/en?pageIndex=1`;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on(".wrap-grid-press .item-card", {
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
    .on(".wrap-grid-press .item-card time[datetime]", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const datetime = el.getAttribute("datetime");
        if (!datetime) {
          return;
        }

        const parsedDate = new Date(datetime.replace(" ", "T"));
        if (!Number.isNaN(parsedDate.getTime())) {
          currentEntry.datetime = parsedDate;
        }
      },
    })
    .on(".wrap-grid-press .item-card .item-title", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;

        if (text.lastInTextNode) {
          const normalizedTitle = normalizeWhitespace(currentEntry.title);
          currentEntry.title = normalizedTitle;
          currentEntry.text = normalizedTitle;
        }
      },
    })
    .on(".wrap-grid-press .item-card .btns-wrapper a[href]", {
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
    });

  const body = rewriter.transform(response).body;
  if (body) {
    await consume(body);
  }

  return {
    id: PAGE_URL,
    link: PAGE_URL,
    title: "MFE-MEDIAFOREUROPE - Document Search",
    description: "Latest documents published by MFE-MEDIAFOREUROPE.",
    language: "en",
    entries: entries.filter((entry) => isValidRSSEntry(entry)),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(PAGE_URL, {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
