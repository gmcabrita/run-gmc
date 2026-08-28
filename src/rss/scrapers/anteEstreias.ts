import {
  USERAGENT,
  decodeHtmlEntities,
  isValidRSSEntry,
  type ScraperContext,
} from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://anteestreias.blogspot.com";
const API_URL = `${BASE_URL}/search/label/-%20bilhetes%20cinema?m=0`;
const EXCLUDED_HOSTS = new Set(["anteestreias.blogspot.com", "www.blogger.com", "blogger.com"]);

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replaceAll(/<[^>]*>/g, " "))
    .replaceAll(/\s+/g, " ")
    .trim();
}

function readHtmlAttribute(tag: string, name: string) {
  const regex = new RegExp(`\\s${name}=(['"])([\\s\\S]*?)\\1`, "i");
  const match = tag.match(regex);
  const value = match?.[2];

  return value ? decodeHtmlEntities(value).trim() : undefined;
}

function normalizeUrl(url: string) {
  try {
    return new URL(url, BASE_URL).href;
  } catch {
    return undefined;
  }
}

function parseDatetime(value: string) {
  const datetime = new Date(value);
  return Number.isNaN(datetime.getTime()) ? undefined : datetime;
}

function isExternalUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return !EXCLUDED_HOSTS.has(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function getBlogPostsHtml(htmlText: string) {
  const blogPostsStart = htmlText.indexOf("<div class='blog-posts hfeed'>");
  const blogPagerStart = htmlText.indexOf("<div class='blog-pager'", blogPostsStart);

  if (blogPostsStart === -1 || blogPagerStart === -1) {
    return htmlText;
  }

  return htmlText.slice(blogPostsStart, blogPagerStart);
}

function getPostBodies(blogPostsHtml: string) {
  const posts: Array<{ body: string; datetime?: Date }> = [];
  const postRegex = /<div class='post hentry[\s\S]*?<div class='post-body[^>]*>([\s\S]*?)<div style='clear: both;'><\/div>\s*<\/div>[\s\S]*?<abbr class='published'[^>]*title='([^']+)'/gi;
  let postMatch;

  while ((postMatch = postRegex.exec(blogPostsHtml)) !== null) {
    const body = postMatch[1];
    const datetimeText = postMatch[2];

    if (body) {
      posts.push({
        body,
        datetime: datetimeText ? parseDatetime(decodeHtmlEntities(datetimeText)) : undefined,
      });
    }
  }

  if (posts.length > 0) {
    return posts;
  }

  return [{ body: blogPostsHtml }];
}

function parseRows(body: string, datetime?: Date) {
  const entries: Array<RSSEntry> = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(body)) !== null) {
    const trContent = trMatch[1];
    const imageTag = trContent?.match(/<img\b[^>]*>/i)?.[0];
    const movieTitle = imageTag
      ? readHtmlAttribute(imageTag, "title") || readHtmlAttribute(imageTag, "alt")
      : undefined;
    const imageURL = imageTag ? normalizeUrl(readHtmlAttribute(imageTag, "src") || "") : undefined;
    const linkRegex = /<a\b[^>]*href=(['"])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(trContent || "")) !== null) {
      const url = normalizeUrl(decodeHtmlEntities(linkMatch[2] || ""));

      if (!url || !isExternalUrl(url)) {
        continue;
      }

      const linkText = stripHtml(linkMatch[3] || "");

      entries.push({
        datetime,
        id: url,
        imageURL,
        link: url,
        text: linkText ? `${linkText}: ${url}` : url,
        title: movieTitle || linkText || url,
      });
    }
  }

  return entries;
}

export function parse(htmlText: string): RSSData {
  const entries = getPostBodies(getBlogPostsHtml(htmlText))
    .flatMap((post) => parseRows(post.body, post.datetime))
    .filter(isValidRSSEntry);

  return {
    description: "External URLs extracted from Ante-Estreias bilhetes cinema posts",
    entries,
    id: API_URL,
    language: "pt",
    link: API_URL,
    title: "Ante-Estreias Cinema",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": USERAGENT,
    },
  });

  const htmlText = await response.text();
  return parse(htmlText);
}
