import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export interface RtpFinancialDocumentPageConfig {
  pageUrl: string;
  title: string;
  description: string;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function parseRtpFinancialDocumentPage(
  response: Response,
  config: RtpFinancialDocumentPageConfig,
): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;

  const rewriter = new HTMLRewriter().on("#artigo a[href]", {
    element(el) {
      const href = el.getAttribute("href");
      if (!href) {
        currentEntry = null;
        return;
      }

      const link = new URL(href, config.pageUrl).toString();
      currentEntry = {
        id: link,
        link,
        title: "",
        text: "",
      };
      entries.push(currentEntry);
    },
    text(text) {
      if (!currentEntry) {
        return;
      }

      currentEntry.title += text.text;
    },
  });

  const body = rewriter.transform(response).body;
  if (body) {
    await consume(body);
  }

  return {
    id: config.pageUrl,
    link: config.pageUrl,
    title: config.title,
    description: config.description,
    language: "pt",
    entries: entries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        return {
          ...entry,
          title,
          text: title,
        };
      })
      .filter((entry) => isValidRSSEntry(entry)),
  };
}

export async function fetchRtpFinancialDocumentPage(
  config: RtpFinancialDocumentPageConfig,
  _ctx: ScraperContext,
): Promise<RSSData> {
  const response = await fetch(config.pageUrl, {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parseRtpFinancialDocumentPage(response, config);
}
