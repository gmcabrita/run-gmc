import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  fallback,
  looseObject,
  nullish,
  optional,
  safeParse,
  string,
  unknown,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://www.kernel.sh/";
const BLOG_URL = "https://www.kernel.sh/blog";
const TITLE = "Kernel Blog";
const DESCRIPTION = "Engineering Blog for Fast Browser Agents";
const NEXT_DATA_PREFIX = 'self.__next_f.push([1,"';
const POSTS_MARKER = '"posts":';

const KernelPostImageSchema = looseObject({
  asset: looseObject({
    url: string(),
  }),
});
const KernelPostSchema = looseObject({
  excerpt: fallback(nullish(string()), undefined),
  mainImage: optional(unknown()),
  previewImage: optional(unknown()),
  publishedAt: string(),
  slug: looseObject({
    current: string(),
  }),
  title: string(),
});
const KernelPostListSchema = array(unknown());

type KernelPost = InferOutput<typeof KernelPostSchema>;

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function parseDate(value: string): Date | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

function parseJsonStringLiteral(content: string): string | undefined {
  const result = safeParse(string(), JSON.parse(`"${content}"`));
  return result.success ? result.output : undefined;
}

function decodeNextDataScripts(html: string): Array<string> {
  const scripts: Array<string> = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf(NEXT_DATA_PREFIX, cursor);
    if (start === -1) {
      return scripts;
    }

    const contentStart = start + NEXT_DATA_PREFIX.length;
    let contentEnd = contentStart;
    let escaped = false;
    while (contentEnd < html.length) {
      const char = html[contentEnd];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        break;
      }
      contentEnd += 1;
    }

    if (contentEnd >= html.length) {
      return scripts;
    }

    const decoded = parseJsonStringLiteral(html.slice(contentStart, contentEnd));
    if (decoded) {
      scripts.push(decoded);
    }

    cursor = contentEnd + 1;
  }

  return scripts;
}

function extractBalancedArray(source: string, arrayStart: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(arrayStart, index + 1);
      }
    }
  }

  return undefined;
}

function extractPostsJson(source: string): string | undefined {
  const markerIndex = source.indexOf(POSTS_MARKER);
  if (markerIndex === -1) {
    return undefined;
  }

  const arrayStart = source.indexOf("[", markerIndex + POSTS_MARKER.length);
  if (arrayStart === -1) {
    return undefined;
  }

  return extractBalancedArray(source, arrayStart);
}

function parsePost(payload: KernelPost): RSSEntry | undefined {
  if (!payload.title || !payload.publishedAt || !payload.slug.current) {
    return undefined;
  }

  const previewImageResult = safeParse(KernelPostImageSchema, payload.previewImage);
  const mainImageResult = safeParse(KernelPostImageSchema, payload.mainImage);
  const link = new URL(`/blog/${payload.slug.current}`, BASE_URL).toString();
  const imageURL = previewImageResult.success
    ? previewImageResult.output.asset.url
    : mainImageResult.success
      ? mainImageResult.output.asset.url
      : undefined;
  const datetime = parseDate(payload.publishedAt);
  const entry: RSSEntry = {
    id: link,
    link,
    text: normalizeWhitespace(payload.excerpt ?? ""),
    title: normalizeWhitespace(payload.title),
  };

  if (datetime) {
    entry.datetime = datetime;
  }

  if (imageURL) {
    entry.imageURL = imageURL;
  }

  return entry;
}

function parsePostsJson(json: string): Array<RSSEntry> {
  const listResult = safeParse(KernelPostListSchema, JSON.parse(json));
  if (!listResult.success) {
    return [];
  }

  return listResult.output.flatMap((post) => {
    const postResult = safeParse(KernelPostSchema, post);
    if (!postResult.success) {
      return [];
    }

    const entry = parsePost(postResult.output);
    return entry ? [entry] : [];
  });
}

function extractEntries(html: string): Array<RSSEntry> {
  return decodeNextDataScripts(html).flatMap((script) => {
    const postsJson = extractPostsJson(script);
    if (!postsJson) {
      return [];
    }

    return parsePostsJson(postsJson);
  });
}

export async function parse(response: Response): Promise<RSSData> {
  const html = await response.text();

  return {
    description: DESCRIPTION,
    entries: extractEntries(html)
      .filter(isValidRSSEntry)
      .sort((a, b) => {
        const aTime = a.datetime?.getTime() ?? 0;
        const bTime = b.datetime?.getTime() ?? 0;
        return bTime - aTime;
      }),
    id: BLOG_URL,
    language: "en",
    link: BLOG_URL,
    title: TITLE,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BLOG_URL, {
    headers: {
      accept: "text/html",
      "user-agent": USERAGENT,
    },
    redirect: "follow",
  });

  return parse(response);
}
