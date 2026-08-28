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
  return value.replaceAll(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith("#")) {
      const radix = normalizedEntity.startsWith("#x") ? 16 : 10;
      const digits = normalizedEntity.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      const isValidCodePoint =
        codePoint > 0 &&
        codePoint <= 0x10_ff_ff &&
        (codePoint < 0xd8_00 || codePoint > 0xdf_ff);

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
        (codePoint >= 0x20 && codePoint <= 0xd7_ff) ||
        (codePoint >= 0xe0_00 && codePoint <= 0xff_fd) ||
        (codePoint >= 0x1_00_00 && codePoint <= 0x10_ff_ff)
      );
    })
    .join("");
}

export async function consume(stream: ReadableStream) {
  const reader = stream.getReader();
  while (true) {
    if ((await reader.read()).done) {
      return;
    }
  }
}
