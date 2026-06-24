import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_ORIGIN = "https://www.publico.pt";
const SECTION_PATH = "/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;
const API_URL = "https://www.publico.pt/api/list/media?page=1&size=20";

type FetchFn = typeof fetch;

interface PublicoArticle {
  id: string;
  link: string;
  title: string;
  text?: string;
  datetime?: Date;
  imageURL?: string;
}

const HTML_ENTITY_BY_NAME: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalizedEntity = entity.toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITY_BY_NAME[normalizedEntity] ?? match;
  });
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, " ");
}

function normalizeWhitespace(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  return decodeHtmlEntities(stripTags(text)).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || undefined;
}

function normalizeUrl(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  return new URL(decodeHtmlEntities(href), SITE_ORIGIN).href;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readPrimaryTagName(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const tag of value) {
    if (!isRecord(tag) || readBoolean(tag.isPrincipal) !== true) {
      continue;
    }

    const name = normalizeWhitespace(readString(tag.nome));
    if (name) {
      return name;
    }
  }

  return undefined;
}

function parseArticle(value: unknown): PublicoArticle | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const link = normalizeUrl(readString(value.fullUrl) ?? readString(value.url) ?? readString(value.shareUrl));
  if (!link) {
    return undefined;
  }

  const title = normalizeWhitespace(readString(value.tituloNoticia) ?? readString(value.titulo) ?? readString(value.cleanTitle));
  if (!title) {
    return undefined;
  }

  const text =
    normalizeWhitespace(readString(value.descricao)) ??
    normalizeWhitespace(readString(value.lead)) ??
    normalizeWhitespace(readString(value.subtitulo)) ??
    normalizeWhitespace(readString(value.rubrica)) ??
    readPrimaryTagName(value.tags) ??
    title;

  return {
    id: link,
    link,
    title,
    text,
    datetime: parseDate(readString(value.data) ?? readString(value.dataActualizacao)),
    imageURL: readBoolean(value.escondeImagem) === true ? undefined : normalizeUrl(readString(value.multimediaPrincipal)),
  };
}

function readArticles(value: unknown): PublicoArticle[] {
  if (Array.isArray(value)) {
    return value.flatMap((article) => {
      const parsedArticle = parseArticle(article);
      return parsedArticle ? [parsedArticle] : [];
    });
  }

  if (!isRecord(value)) {
    return [];
  }

  const articles = value.items ?? value.results ?? value.data;
  return readArticles(articles);
}

function buildFeed(entries: RSSEntry[]): RSSData {
  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Público - Media",
    description: "Público Media",
    language: "pt",
    entries,
  };
}

export function parseApiResponse(json: unknown): RSSData {
  const entries: RSSEntry[] = readArticles(json)
    .map((article) => ({
      id: article.id,
      link: article.link,
      title: article.title,
      text: article.text,
      datetime: article.datetime,
      imageURL: article.imageURL,
    }))
    .filter(isValidRSSEntry);

  return buildFeed(entries);
}

export async function scrapeMediaApi(fetchFn: FetchFn): Promise<RSSData> {
  const response = await fetchFn(API_URL, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Público media request failed: ${response.status}`);
  }

  return parseApiResponse(await response.json());
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapeMediaApi(fetchFn);
}
