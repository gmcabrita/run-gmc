import { decodeHtmlEntities, isValidRSSEntry, USERAGENT, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";
import {
  array,
  fallback,
  looseObject,
  nullish,
  picklist,
  safeParse,
  string,
  unknown,
  type InferOutput,
} from "valibot";

const SITE_ORIGIN = "https://expresso.pt";
const BASE_URL = `${SITE_ORIGIN}/media-comunicacao`;
const API_URL =
  "https://expresso.pt/api/gs/expresso/v1/molecule/feed?categories=%2Fmedia-comunicacao&category=media-comunicacao&contentTypes=ARTICLE%2CSTREAM%2CNEWSLETTER%2CVIDEO&limit=20";

const OptionalTextSchema = fallback(nullish(string()), undefined);
const ExpressoPictureSchema = looseObject({
  urlLandscape: OptionalTextSchema,
  urlOriginal: OptionalTextSchema,
  urlThumbnail: OptionalTextSchema,
});
const OptionalExpressoPictureSchema = fallback(
  nullish(ExpressoPictureSchema),
  undefined,
);
const ExpressoContentSchema = looseObject({
  code: OptionalTextSchema,
  headlineTitle: OptionalTextSchema,
  lastModifiedDate: OptionalTextSchema,
  lead: OptionalTextSchema,
  link: OptionalTextSchema,
  picture: OptionalExpressoPictureSchema,
  publishedDate: OptionalTextSchema,
  tickerDescription: OptionalTextSchema,
  title: OptionalTextSchema,
  type: picklist(["ARTICLE", "STREAM", "NEWSLETTER", "VIDEO"]),
  uuid: OptionalTextSchema,
});
const ExpressoApiPayloadSchema = looseObject({
  contents: array(unknown()),
});

export type ExpressoApiPayload = InferOutput<typeof ExpressoApiPayloadSchema>;
type ExpressoContent = InferOutput<typeof ExpressoContentSchema>;
type ExpressoPicture = InferOutput<typeof ExpressoPictureSchema>;

interface ExpressoEntry {
  datetime?: Date;
  id: string;
  imageURL?: string;
  link: string;
  text: string;
  title: string;
}

const EMPTY_EXPRESSO_PAYLOAD = { contents: [] } satisfies ExpressoApiPayload;

function normalizeText(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return (
    decodeHtmlEntities(value.replaceAll(/<[^>]*>/g, " "))
      .replaceAll('\u00A0', " ")
      .replaceAll(/\s+/g, " ")
      .trim() || undefined
  );
}

function resolveUrl(value: string | null | undefined): string | undefined {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue || !URL.canParse(normalizedValue, SITE_ORIGIN)) {
    return undefined;
  }

  return new URL(normalizedValue, SITE_ORIGIN).href;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readImageUrl(picture: ExpressoPicture | null | undefined): string | undefined {
  return (
    resolveUrl(picture?.urlLandscape) ??
    resolveUrl(picture?.urlOriginal) ??
    resolveUrl(picture?.urlThumbnail)
  );
}

function parseContent(content: ExpressoContent): ExpressoEntry | undefined {
  const link = resolveUrl(content.link);
  const title = normalizeText(content.title) ?? normalizeText(content.headlineTitle);
  if (!link || !title) {
    return undefined;
  }

  return {
    datetime: parseDate(content.publishedDate) ?? parseDate(content.lastModifiedDate),
    id: normalizeText(content.uuid) ?? normalizeText(content.code) ?? link,
    imageURL: readImageUrl(content.picture),
    link,
    text: normalizeText(content.lead) ?? normalizeText(content.tickerDescription) ?? title,
    title,
  };
}

export function parse(payload: ExpressoApiPayload): RSSData {
  const payloadResult = safeParse(ExpressoApiPayloadSchema, payload);
  const contents = payloadResult.success ? payloadResult.output.contents : [];
  const entries: Array<RSSEntry> = contents
    .flatMap((content) => {
      const contentResult = safeParse(ExpressoContentSchema, content);
      if (!contentResult.success) {
        return [];
      }

      const entry = parseContent(contentResult.output);
      return entry ? [entry] : [];
    })
    .filter(isValidRSSEntry);

  return {
    description: "Expresso Media e Comunicação",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Expresso - Media e Comunicação",
  };
}

export async function scrapeMediaApi(
  env: ProxiedFetchEnv,
  relayFetcher: ProxiedFetch = fetch,
): Promise<RSSData> {
  const response = await createProxiedFetch(env, relayFetcher)(API_URL, {
    headers: {
      accept: "application/json, text/plain, */*",
      Referer: `${BASE_URL}/`,
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Expresso media request failed: ${response.status}`);
  }

  const payloadResult = safeParse(ExpressoApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_EXPRESSO_PAYLOAD);
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return scrapeMediaApi(ctx.env);
}
