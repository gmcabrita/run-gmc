import type { RSSEntry } from "@rss/types";

export const USERAGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export function isValidRSSEntry(entry: RSSEntry) {
  return new Boolean(entry.id) && new Boolean(entry.link) && new Boolean(entry.title);
}
