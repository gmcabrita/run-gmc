import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://brokenbrowser.com/blog/";
const SITE_ORIGIN = "https://brokenbrowser.com";

const ACRONYMS = new Set([
  "api",
  "boa",
  "cdp",
  "csp",
  "cpu",
  "dos",
  "dtd",
  "html",
  "http",
  "ie",
  "lmz",
  "mht",
  "mhtml",
  "msrc",
  "pdf",
  "pidl",
  "rce",
  "sop",
  "swf",
  "ua",
  "url",
  "uxss",
  "wasm",
  "wmp",
  "xhr",
  "xml",
  "xss",
]);

function parseSlug(pathname: string): { date: Date | undefined; title: string } | undefined {
  const slug = pathname.match(/^\/blog\/(\d{4}-\d{2}-\d{2})-(.+)\/$/);
  if (!slug) {
    return undefined;
  }

  const date = new Date(`${slug[1]}T00:00:00.000Z`);
  const title = slug[2]
    .split("-")
    .map((word) => {
      if (ACRONYMS.has(word)) {
        return word.toUpperCase();
      }

      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");

  return {
    date: Number.isNaN(date.getTime()) ? undefined : date,
    title,
  };
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: RSSEntry[] = [];

  const rewriter = new HTMLRewriter().on("#table-content a[href^='/blog/']", {
    element(el) {
      const href = el.getAttribute("href");
      if (!href) {
        return;
      }

      const link = new URL(href, SITE_ORIGIN).toString();
      const parsed = parseSlug(new URL(link).pathname);
      if (!parsed) {
        return;
      }

      entries.push({
        id: link,
        link,
        title: parsed.title,
        text: parsed.title,
        datetime: parsed.date,
      });
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
    entries: entries.filter(isValidRSSEntry).sort((a, b) => {
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
