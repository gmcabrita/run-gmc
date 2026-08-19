import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const SITE_ORIGIN = "https://www.publico.pt";
const SECTION_PATH = "/media";
const BASE_URL = new URL(SECTION_PATH, SITE_ORIGIN).href;
const API_URL = "https://www.publico.pt/api/list/media?page=1&size=20";

type FetchFn = typeof fetch;

const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const OptionalBooleanSchema = v.fallback(v.nullish(v.boolean()), undefined);
const PublicoTagListSchema = v.fallback(
  v.nullish(v.array(v.unknown())),
  undefined,
);
const PublicoTagSchema = v.looseObject({
  nome: OptionalTextSchema,
  isPrincipal: OptionalBooleanSchema,
});
const PublicoArticlePayloadSchema = v.looseObject({
  fullUrl: OptionalTextSchema,
  url: OptionalTextSchema,
  shareUrl: OptionalTextSchema,
  tituloNoticia: OptionalTextSchema,
  titulo: OptionalTextSchema,
  cleanTitle: OptionalTextSchema,
  descricao: OptionalTextSchema,
  lead: OptionalTextSchema,
  subtitulo: OptionalTextSchema,
  rubrica: OptionalTextSchema,
  data: OptionalTextSchema,
  dataActualizacao: OptionalTextSchema,
  multimediaPrincipal: OptionalTextSchema,
  escondeImagem: OptionalBooleanSchema,
  tags: PublicoTagListSchema,
});
const PublicoApiPayloadSchema = v.union([
  v.array(v.unknown()),
  v.looseObject({
    items: v.optional(v.unknown()),
    results: v.optional(v.unknown()),
    data: v.optional(v.unknown()),
  }),
]);

export type PublicoApiPayload = v.InferOutput<typeof PublicoApiPayloadSchema>;
type PublicoArticlePayload = v.InferOutput<typeof PublicoArticlePayloadSchema>;
type PublicoTagList = v.InferOutput<typeof PublicoTagListSchema>;

interface PublicoArticle {
  id: string;
  link: string;
  title: string;
  text?: string;
  datetime?: Date;
  imageURL?: string;
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

    return HTML_ENTITY_BY_NAME.get(normalizedEntity) ?? match;
  });
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, " ");
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function normalizeWhitespace(text: string | null | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  return decodeHtmlEntities(stripTags(text)).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || undefined;
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
    const tagResult = v.safeParse(PublicoTagSchema, tag);
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

function parseArticle(payload: PublicoArticlePayload): PublicoArticle | undefined {
  const link =
    normalizeUrl(payload.fullUrl) ??
    normalizeUrl(payload.url) ??
    normalizeUrl(payload.shareUrl);
  if (!link) {
    return undefined;
  }

  const title =
    normalizeWhitespace(payload.tituloNoticia) ??
    normalizeWhitespace(payload.titulo) ??
    normalizeWhitespace(payload.cleanTitle);
  if (!title) {
    return undefined;
  }

  const text =
    normalizeWhitespace(payload.descricao) ??
    normalizeWhitespace(payload.lead) ??
    normalizeWhitespace(payload.subtitulo) ??
    normalizeWhitespace(payload.rubrica) ??
    readPrimaryTagName(payload.tags) ??
    title;

  return {
    id: link,
    link,
    title,
    text,
    datetime: parseDate(
      normalizeOptionalText(payload.data) ?? normalizeOptionalText(payload.dataActualizacao),
    ),
    imageURL:
      payload.escondeImagem === true ? undefined : normalizeUrl(payload.multimediaPrincipal),
  };
}

function readArticles(payload: PublicoApiPayload): PublicoArticle[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const articleResult = v.safeParse(PublicoArticlePayloadSchema, item);
      if (articleResult.success) {
        const article = parseArticle(articleResult.output);
        if (article) {
          return [article];
        }
      }

      const containerResult = v.safeParse(PublicoApiPayloadSchema, item);
      return containerResult.success ? readArticles(containerResult.output) : [];
    });
  }

  for (const nestedPayload of [payload.items, payload.results, payload.data]) {
    const containerResult = v.safeParse(PublicoApiPayloadSchema, nestedPayload);
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

export function parseApiResponse(payload: PublicoApiPayload): RSSData {
  const entries: RSSEntry[] = readArticles(payload)
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

  const payloadResult = v.safeParse(PublicoApiPayloadSchema, await response.json());
  return parseApiResponse(
    payloadResult.success ? payloadResult.output : EMPTY_PUBLICO_PAYLOAD,
  );
}

export async function get(_ctx: ScraperContext, fetchFn: FetchFn = fetch): Promise<RSSData> {
  return scrapeMediaApi(fetchFn);
}
