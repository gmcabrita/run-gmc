import type { Context } from "hono";
import type { RSSEntry } from "@rss/types";

export type ScraperContext = Context<{ Bindings: CloudflareBindings }>;

export const USERAGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export function isValidRSSEntry(entry: RSSEntry) {
  return Boolean(entry.id) && Boolean(entry.link) && Boolean(entry.title);
}

export function stripInvalidXmlChars(value: string) {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "");
}

export async function consume(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
}
