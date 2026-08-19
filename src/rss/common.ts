import type { Context } from "hono";
import type { RSSEntry } from "@rss/types";

export type ScraperContext = Context<{ Bindings: CloudflareBindings }>;

export const USERAGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export function isValidRSSEntry(entry: RSSEntry) {
  return Boolean(entry.id) && Boolean(entry.link) && Boolean(entry.title);
}

const namedHtmlEntities = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith("#")) {
      const radix = normalizedEntity.startsWith("#x") ? 16 : 10;
      const digits = normalizedEntity.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      const isValidCodePoint =
        codePoint > 0 &&
        codePoint <= 0x10ffff &&
        (codePoint < 0xd800 || codePoint > 0xdfff);

      return isValidCodePoint ? String.fromCodePoint(codePoint) : match;
    }

    return namedHtmlEntities.get(normalizedEntity) ?? match;
  });
}

export function stripInvalidXmlChars(value: string) {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0)!;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
}

export async function consume(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
}
