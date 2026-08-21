import { decodeHtmlEntities, isValidRSSEntry, USERAGENT, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch, type ProxiedFetch, type ProxiedFetchEnv } from "../../proxiedFetch";
import * as v from "valibot";

const SITE_ORIGIN = "https://expresso.pt";
const BASE_URL = `${SITE_ORIGIN}/media-comunicacao`;
const API_URL =
  "https://expresso.pt/api/gs/expresso/v1/molecule/feed?categories=%2Fmedia-comunicacao&category=media-comunicacao&contentTypes=ARTICLE%2CSTREAM%2CNEWSLETTER%2CVIDEO&limit=20";

const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const ExpressoPictureSchema = v.looseObject({
  urlLandscape: OptionalTextSchema,
  urlOriginal: OptionalTextSchema,
  urlThumbnail: OptionalTextSchema,
});
const OptionalExpressoPictureSchema = v.fallback(
  v.nullish(ExpressoPictureSchema),
  undefined,
);
const ExpressoContentSchema = v.looseObject({
  type: v.picklist(["ARTICLE", "STREAM", "NEWSLETTER", "VIDEO"]),
  uuid: OptionalTextSchema,
  code: OptionalTextSchema,
  link: OptionalTextSchema,
  title: OptionalTextSchema,
  headlineTitle: OptionalTextSchema,
  lead: OptionalTextSchema,
  tickerDescription: OptionalTextSchema,
  publishedDate: OptionalTextSchema,
  lastModifiedDate: OptionalTextSchema,
  picture: OptionalExpressoPictureSchema,
});
const ExpressoApiPayloadSchema = v.looseObject({
  contents: v.array(v.unknown()),
});

export type ExpressoApiPayload = v.InferOutput<typeof ExpressoApiPayloadSchema>;
type ExpressoContent = v.InferOutput<typeof ExpressoContentSchema>;
type ExpressoPicture = v.InferOutput<typeof ExpressoPictureSchema>;

interface ExpressoEntry {
  id: string;
  link: string;
  title: string;
  text: string;
  datetime?: Date;
  imageURL?: string;
}

const EMPTY_EXPRESSO_PAYLOAD = { contents: [] } satisfies ExpressoApiPayload;

function normalizeText(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return (
    decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
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
    id: normalizeText(content.uuid) ?? normalizeText(content.code) ?? link,
    link,
    title,
    text: normalizeText(content.lead) ?? normalizeText(content.tickerDescription) ?? title,
    datetime: parseDate(content.publishedDate) ?? parseDate(content.lastModifiedDate),
    imageURL: readImageUrl(content.picture),
  };
}

export function parse(payload: ExpressoApiPayload): RSSData {
  const payloadResult = v.safeParse(ExpressoApiPayloadSchema, payload);
  const contents = payloadResult.success ? payloadResult.output.contents : [];
  const entries: RSSEntry[] = contents
    .flatMap((content) => {
      const contentResult = v.safeParse(ExpressoContentSchema, content);
      if (!contentResult.success) {
        return [];
      }

      const entry = parseContent(contentResult.output);
      return entry ? [entry] : [];
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Expresso - Media e Comunicação",
    description: "Expresso Media e Comunicação",
    language: "pt",
    entries,
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

  const payloadResult = v.safeParse(ExpressoApiPayloadSchema, await response.json());
  return parse(payloadResult.success ? payloadResult.output : EMPTY_EXPRESSO_PAYLOAD);
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return scrapeMediaApi(ctx.env);
}
