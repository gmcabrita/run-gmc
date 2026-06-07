import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { idempotentSendEmail } from "@email";

const FEED_URL = "https://cinemax.rtp.pt/passatempos/feed/";
const SITE_URL = "https://cinemax.rtp.pt/passatempos/";
const FINISHED_TITLE_MARKER = "[Terminado]";

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeCodePoint(value: number, fallback: string) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    return fallback;
  }

  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

function decodeXmlText(value: string) {
  const trimmed = value.trim();
  const unwrapped =
    trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")
      ? trimmed.slice("<![CDATA[".length, -"]]>".length)
      : trimmed;

  return unwrapped
    .replace(/&#x([0-9a-fA-F]+);/g, (entity, hex) =>
      decodeCodePoint(Number.parseInt(hex, 16), entity),
    )
    .replace(/&#([0-9]+);/g, (entity, decimal) =>
      decodeCodePoint(Number.parseInt(decimal, 10), entity),
    )
    .replace(/&([a-zA-Z]+);/g, (entity, name) => XML_ENTITIES[name] ?? entity);
}

function tagText(xml: string, tagName: string) {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`).exec(xml);
  const value = match?.[1];
  return value ? decodeXmlText(value) : undefined;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return normalizeText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function parseDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function firstImageURL(value: string) {
  const match = /<img\b[^>]*\bsrc=(["'])([^"']+)\1/i.exec(value);
  const src = match?.[2];
  return src ? decodeXmlText(src) : undefined;
}

function entryFromItem(itemXml: string): RSSEntry | undefined {
  const title = normalizeText(tagText(itemXml, "title") ?? "");
  if (!title || title.includes(FINISHED_TITLE_MARKER)) {
    return undefined;
  }

  const link = normalizeText(tagText(itemXml, "link") ?? "");
  const id = normalizeText(tagText(itemXml, "guid") ?? link);
  const content = tagText(itemXml, "content:encoded") ?? tagText(itemXml, "description") ?? "";
  const datetime = parseDate(tagText(itemXml, "pubDate"));
  const imageURL = firstImageURL(content);

  const entry: RSSEntry = {
    id,
    link,
    title,
    text: stripHtml(content),
  };

  if (datetime) {
    entry.datetime = datetime;
  }

  if (imageURL) {
    entry.imageURL = imageURL;
  }

  return isValidRSSEntry(entry) ? entry : undefined;
}

export async function parse(response: Response): Promise<RSSData> {
  const xml = await response.text();
  const channel = tagText(xml, "channel") ?? xml;
  const entries = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
    .map((match) => match[1])
    .filter((itemXml) => itemXml !== undefined)
    .map((itemXml) => entryFromItem(itemXml))
    .filter((entry) => entry !== undefined);

  return {
    id: FEED_URL,
    link: normalizeText(tagText(channel, "link") ?? SITE_URL),
    title: normalizeText(tagText(channel, "title") ?? "Passatempos Archive - RTP Cinemax"),
    description: normalizeText(
      tagText(channel, "description") ??
        "Um site português com um olhar sobre a actualidade do cinema: os filmes, as estreias, festivais e as rodagens.",
    ),
    language: normalizeText(tagText(channel, "language") ?? "pt-PT"),
    entries,
  };
}

export async function get(_ctx?: ScraperContext): Promise<RSSData> {
  const response = await fetch(FEED_URL, {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "application/rss+xml",
    },
  });

  return parse(response);
}

export async function sendCinemaxRtpPassatemposEntriesByEmail(env: CloudflareBindings) {
  const data = await get();

  for (const entry of data.entries) {
    await idempotentSendEmail(env, {
      to: "goncalo.mendes.cabrita@gmail.com",
      subject: `[Passatempo] ${entry.title}`,
      body: `<h2><a href="${entry.link}">${entry.title}</a></h2>`.trim(),
      idempotencyKey: `cinemax-rtp-passatempos-${entry.id}`,
    });
  }

  return data;
}
