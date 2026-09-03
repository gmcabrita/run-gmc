import { consume, decodeHtmlEntities, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { literal, looseObject, parse as parseSchema, string } from "valibot";

const SITE_ORIGIN = "https://colossus.com";
const BASE_URL = `${SITE_ORIGIN}/mag/`;
const AJAX_URL = `${SITE_ORIGIN}/wp/wp-admin/admin-ajax.php`;
const COLOSSUS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

const ColossusAjaxResponseSchema = looseObject({
  data: looseObject({
    html: string(),
  }),
  success: literal(true),
});

interface ColossusDraftEntry {
  author: string;
  excerpt: string;
  href?: string;
  imageURL?: string;
  title: string;
}

function normalizeText(value: string): string | undefined {
  return (
    decodeHtmlEntities(value).replaceAll("\u00A0", " ").replaceAll(/\s+/g, " ").trim() || undefined
  );
}

function resolveColossusUrl(value: string | undefined): string | undefined {
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

function resolveArticleUrl(value: string | undefined): string | undefined {
  const url = resolveColossusUrl(value);
  return url && new URL(url).pathname.startsWith("/article/") ? url : undefined;
}

function appendToLatestEntry(
  entries: Array<ColossusDraftEntry>,
  field: "author" | "excerpt" | "title",
  value: string,
): void {
  const entry = entries.at(-1);
  if (entry) {
    entry[field] += value;
  }
}

function parseDraftEntry(entry: ColossusDraftEntry): RSSEntry | undefined {
  const link = resolveArticleUrl(entry.href);
  const title = normalizeText(entry.title);
  if (!link || !title) {
    return undefined;
  }

  const details = [normalizeText(entry.excerpt), normalizeText(entry.author)].filter(
    (value): value is string => value !== undefined,
  );

  return {
    id: link,
    imageURL: resolveColossusUrl(entry.imageURL),
    link,
    text: details.length > 0 ? details.join(" | ") : title,
    title,
  };
}

export async function parse(html: string): Promise<RSSData> {
  const draftEntries: Array<ColossusDraftEntry> = [];
  const rewriter = new HTMLRewriter()
    .on(".loop-item.loop-post", {
      element() {
        draftEntries.push({ author: "", excerpt: "", title: "" });
      },
    })
    .on(".loop-item.loop-post .loop-post__anchor", {
      element(element) {
        const entry = draftEntries.at(-1);
        if (entry && !entry.href) {
          entry.href = element.getAttribute("href") ?? undefined;
        }
      },
    })
    .on(".loop-item.loop-post .loop-post__image img", {
      element(element) {
        const entry = draftEntries.at(-1);
        if (entry && !entry.imageURL) {
          entry.imageURL =
            element.getAttribute("data-src") ?? element.getAttribute("src") ?? undefined;
        }
      },
    })
    .on(".loop-item.loop-post .loop-post__title", {
      text(text) {
        appendToLatestEntry(draftEntries, "title", text.text);
      },
    })
    .on(".loop-item.loop-post .loop-post__excerpt", {
      text(text) {
        appendToLatestEntry(draftEntries, "excerpt", text.text);
      },
    })
    .on(".loop-item.loop-post .loop-post__author", {
      text(text) {
        appendToLatestEntry(draftEntries, "author", text.text);
      },
    });

  const response = new Response(html, { headers: { "Content-Type": "text/html" } });
  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing Colossus article HTML body");
  }
  await consume(body);

  const entries = draftEntries.flatMap((entry) => {
    const parsedEntry = parseDraftEntry(entry);
    return parsedEntry ? [parsedEntry] : [];
  });

  return {
    description:
      "Definitive accounts of investors, founders, companies, and the people and ideas that inspire them",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Colossus Magazine",
  };
}

function createRequestBody(): FormData {
  const body = new FormData();
  body.set("action", "articles_load_more");
  body.set("type", "review");
  body.set("page", "1");
  body.set("post_id", "");
  body.set("posts_per_page", "35");
  return body;
}

export async function scrape(fetchFn: typeof fetch = fetch): Promise<RSSData> {
  const response = await fetchFn(AJAX_URL, {
    body: createRequestBody(),
    headers: {
      accept: "*/*",
      "user-agent": COLOSSUS_USER_AGENT,
    },
    method: "POST",
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Colossus articles request failed: ${response.status}`);
  }

  const payload = parseSchema(ColossusAjaxResponseSchema, await response.json());
  return parse(payload.data.html);
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  return scrape();
}
