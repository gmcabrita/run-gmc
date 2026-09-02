import { consume, decodeHtmlEntities, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";

const SITE_ORIGIN = "https://pressgazette.co.uk";
const BASE_URL = `${SITE_ORIGIN}/all-articles/`;
// The relay needs this query and short user agent to avoid Press Gazette's Varnish 403 response.
const REQUEST_URL = `${BASE_URL}?output=1`;
const PRESS_GAZETTE_USER_AGENT = "Mozilla/5.0";

interface PressGazetteDraftEntry {
  href?: string;
  imageURL?: string;
  subtitle: string;
  title: string;
}

function normalizeText(value: string): string | undefined {
  return (
    decodeHtmlEntities(value).replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim() || undefined
  );
}

function resolveSiteUrl(value: string | undefined): string | undefined {
  if (!value || !URL.canParse(value, SITE_ORIGIN)) {
    return undefined;
  }

  const url = new URL(value, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) {
    return undefined;
  }

  url.hash = "";
  return url.href;
}

function parseDraftEntry(entry: PressGazetteDraftEntry): RSSEntry | undefined {
  const link = resolveSiteUrl(entry.href);
  const title = normalizeText(entry.title);
  if (!link || !title) {
    return undefined;
  }

  return {
    id: link,
    imageURL: resolveSiteUrl(entry.imageURL),
    link,
    text: normalizeText(entry.subtitle) ?? title,
    title,
  };
}

function appendToLatestEntry(
  entries: Array<PressGazetteDraftEntry>,
  field: "subtitle" | "title",
  value: string,
): void {
  const entry = entries.at(-1);
  if (entry) {
    entry[field] += value;
  }
}

export async function parse(response: Response): Promise<RSSData> {
  const draftEntries: Array<PressGazetteDraftEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".c-story.c-story--catalogue", {
      element() {
        draftEntries.push({ subtitle: "", title: "" });
      },
    })
    .on(".c-story.c-story--catalogue .post-title a", {
      element(element) {
        const entry = draftEntries.at(-1);
        if (entry && !entry.href) {
          entry.href = element.getAttribute("href") ?? undefined;
        }
      },
      text(text) {
        appendToLatestEntry(draftEntries, "title", text.text);
      },
    })
    .on(".c-story.c-story--catalogue .c-story__header__subtitle", {
      text(text) {
        appendToLatestEntry(draftEntries, "subtitle", text.text);
      },
    })
    .on(".c-story.c-story--catalogue .c-story__image img", {
      element(element) {
        const entry = draftEntries.at(-1);
        if (entry && !entry.imageURL) {
          entry.imageURL =
            element.getAttribute("data-src") ?? element.getAttribute("src") ?? undefined;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing Press Gazette response body");
  }
  await consume(body);

  const entries = draftEntries.flatMap((entry) => {
    const parsedEntry = parseDraftEntry(entry);
    return parsedEntry ? [parsedEntry] : [];
  });

  return {
    description: "The last 100 articles published on Press Gazette",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Latest Articles - Press Gazette",
  };
}

export async function scrape(
  env: ProxiedFetchEnv,
  fetchFn: typeof fetch = fetch,
): Promise<RSSData> {
  const response = await createProxiedFetch(env, fetchFn)(REQUEST_URL, {
    headers: {
      accept: "text/html",
      "user-agent": PRESS_GAZETTE_USER_AGENT,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Press Gazette request failed: ${response.status}`);
  }

  return parse(response);
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return scrape(ctx.env);
}
