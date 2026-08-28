import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

export interface RtpFinancialDocumentPageConfig {
  description: string;
  pageUrl: string;
  title: string;
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, " ").trim();
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
        text: "",
        title: "",
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
    description: config.description,
    entries: entries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        return {
          ...entry,
          text: title,
          title,
        };
      })
      .filter((entry) => isValidRSSEntry(entry)),
    id: config.pageUrl,
    language: "pt",
    link: config.pageUrl,
    title: config.title,
  };
}

export async function fetchRtpFinancialDocumentPage(
  config: RtpFinancialDocumentPageConfig,
  _ctx: ScraperContext,
): Promise<RSSData> {
  const response = await fetch(config.pageUrl, {
    headers: {
      "Content-Type": "text/html",
      "user-agent": USERAGENT,
    },
  });

  return parseRtpFinancialDocumentPage(response, config);
}
