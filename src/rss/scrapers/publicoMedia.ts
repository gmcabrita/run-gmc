import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  boolean,
  fallback,
  looseObject,
  nullish,
  optional,
  safeParse,
  string,
  union,
  unknown,
  type InferOutput,
} from "valibot";

const SITE_ORIGIN = "https://www.publico.pt";
const SECTION_PATH = "/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;
const API_URL = "https://www.publico.pt/api/list/media?page=1&size=20";

type FetchFn = typeof fetch;

const OptionalTextSchema = fallback(nullish(string()), undefined);
const OptionalBooleanSchema = fallback(nullish(boolean()), undefined);
const PublicoTagListSchema = fallback(
  nullish(array(unknown())),
  undefined,
);
const PublicoTagSchema = looseObject({
  isPrincipal: OptionalBooleanSchema,
  nome: OptionalTextSchema,
});
const PublicoArticlePayloadSchema = looseObject({
  cleanTitle: OptionalTextSchema,
  data: OptionalTextSchema,
  dataActualizacao: OptionalTextSchema,
  descricao: OptionalTextSchema,
  escondeImagem: OptionalBooleanSchema,
  fullUrl: OptionalTextSchema,
  lead: OptionalTextSchema,
  multimediaPrincipal: OptionalTextSchema,
  rubrica: OptionalTextSchema,
  shareUrl: OptionalTextSchema,
  subtitulo: OptionalTextSchema,
  tags: PublicoTagListSchema,
  titulo: OptionalTextSchema,
  tituloNoticia: OptionalTextSchema,
  url: OptionalTextSchema,
});
const PublicoApiPayloadSchema = union([
  array(unknown()),
  looseObject({
    data: optional(unknown()),
    items: optional(unknown()),
    results: optional(unknown()),
  }),
]);

export type PublicoApiPayload = InferOutput<typeof PublicoApiPayloadSchema>;
type PublicoArticlePayload = InferOutput<typeof PublicoArticlePayloadSchema>;
type PublicoTagList = InferOutput<typeof PublicoTagListSchema>;

interface PublicoArticle {
  datetime?: Date;
  id: string;
  imageURL?: string;
  link: string;
  text?: string;
  title: string;
}

const EMPTY_PUBLICO_PAYLOAD = [] satisfies PublicoApiPayload;
const HTML_ENTITY_BY_NAME = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

function decodeHtmlEntities(text: string): string {
  return text.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalizedEntity = entity.toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITY_BY_NAME.get(normalizedEntity) ?? match;
  });
}

function stripTags(text: string): string {
  return text.replaceAll(/<[^>]*>/g, " ");
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function normalizeWhitespace(text: string | null | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  return decodeHtmlEntities(stripTags(text)).replaceAll('\u00A0', " ").replaceAll(/\s+/g, " ").trim() || undefined;
}

function normalizeUrl(href: string | null | undefined): string | undefined {
  const normalizedHref = href ? decodeHtmlEntities(href).trim() : "";
  if (normalizedHref.length === 0) {
    return undefined;
  }

  return new URL(normalizedHref, SITE_ORIGIN).href;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readPrimaryTagName(tags: PublicoTagList): string | undefined {
  for (const tag of tags ?? []) {
    const tagResult = safeParse(PublicoTagSchema, tag);
    if (!tagResult.success || tagResult.output.isPrincipal !== true) {
      continue;
    }

    const name = normalizeWhitespace(tagResult.output.nome);
    if (name) {
      return name;
    }
  }

  return undefined;
}

function readArticleLink(payload: PublicoArticlePayload): string | undefined {
  return (
    normalizeUrl(payload.fullUrl) ??
    normalizeUrl(payload.url) ??
    normalizeUrl(payload.shareUrl)
  );
}

function readArticleTitle(payload: PublicoArticlePayload): string | undefined {
  return (
    normalizeWhitespace(payload.tituloNoticia) ??
    normalizeWhitespace(payload.titulo) ??
    normalizeWhitespace(payload.cleanTitle)
  );
}

function readArticleText(payload: PublicoArticlePayload, title: string): string {
  return (
    normalizeWhitespace(payload.descricao) ??
    normalizeWhitespace(payload.lead) ??
    normalizeWhitespace(payload.subtitulo) ??
    normalizeWhitespace(payload.rubrica) ??
    readPrimaryTagName(payload.tags) ??
    title
  );
}

function parseArticle(payload: PublicoArticlePayload): PublicoArticle | undefined {
  const link = readArticleLink(payload);
  if (!link) {
    return undefined;
  }

  const title = readArticleTitle(payload);
  if (!title) {
    return undefined;
  }

  return {
    datetime: parseDate(
      normalizeOptionalText(payload.data) ?? normalizeOptionalText(payload.dataActualizacao),
    ),
    id: link,
    imageURL:
      payload.escondeImagem === true ? undefined : normalizeUrl(payload.multimediaPrincipal),
    link,
    text: readArticleText(payload, title),
    title,
  };
}

function readArticles(payload: PublicoApiPayload): Array<PublicoArticle> {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const articleResult = safeParse(PublicoArticlePayloadSchema, item);
      if (articleResult.success) {
        const article = parseArticle(articleResult.output);
        if (article) {
          return [article];
        }
      }

      const containerResult = safeParse(PublicoApiPayloadSchema, item);
      return containerResult.success ? readArticles(containerResult.output) : [];
    });
  }

  for (const nestedPayload of [payload.items, payload.results, payload.data]) {
    const containerResult = safeParse(PublicoApiPayloadSchema, nestedPayload);
    if (!containerResult.success) {
      continue;
    }

    const articles = readArticles(containerResult.output);
    if (articles.length > 0) {
      return articles;
    }
  }

  return [];
}

function buildFeed(entries: Array<RSSEntry>): RSSData {
  return {
    description: "Público Media",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Público - Media",
  };
}

export function parseApiResponse(payload: PublicoApiPayload): RSSData {
  const entries: Array<RSSEntry> = readArticles(payload)
    .map((article) => ({
      datetime: article.datetime,
      id: article.id,
      imageURL: article.imageURL,
      link: article.link,
      text: article.text,
      title: article.title,
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

  const payloadResult = safeParse(PublicoApiPayloadSchema, await response.json());
  return parseApiResponse(
    payloadResult.success ? payloadResult.output : EMPTY_PUBLICO_PAYLOAD,
  );
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapeMediaApi(fetchFn);
}
