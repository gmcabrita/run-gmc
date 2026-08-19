import {
  USERAGENT,
  decodeHtmlEntities,
  isValidRSSEntry,
  type ScraperContext,
} from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const BASE_URL = "https://www.viralagenda.com/pt/setubal/almada";
const PAGE_SIZE = 30;
const MAX_PAGES = 30;

type FetchFn = typeof fetch;

const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const CalendarDataSchema = v.looseObject({
  name: v.string(),
  startDate: OptionalTextSchema,
  endDate: OptionalTextSchema,
  startTime: OptionalTextSchema,
  endTime: OptionalTextSchema,
  location: OptionalTextSchema,
});
const ViralAgendaAjaxPayloadSchema = v.looseObject({
  html: v.string(),
  pageTotal: v.number(),
});

type CalendarData = v.InferOutput<typeof CalendarDataSchema>;
type ViralAgendaAjaxPayload = v.InferOutput<typeof ViralAgendaAjaxPayloadSchema>;

type ParsedPage = {
  eventCount: number;
  entries: RSSEntry[];
  hasOngoingMarker: boolean;
  hasPastMarker: boolean;
};

function readHtmlAttribute(html: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}=(['"])([\\s\\S]*?)\\1`, "i").exec(html);
  const value = match?.[2];

  return value ? decodeHtmlEntities(value).trim() : undefined;
}

function parseCalendarData(value: string): CalendarData | undefined {
  try {
    const result = v.safeParse(CalendarDataSchema, JSON.parse(value));
    if (!result.success || result.output.name.trim().length === 0) {
      return undefined;
    }

    return { ...result.output, name: result.output.name.trim() };
  } catch {
    return undefined;
  }
}

function parseDatetime(value: string | undefined): Date | undefined {
  if (!value) return undefined;

  const datetime = new Date(value);
  return Number.isNaN(datetime.getTime()) ? undefined : datetime;
}

function isNonEmptyText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.length > 0;
}

function buildText(data: CalendarData): string | undefined {
  const date =
    data.startDate && data.endDate && data.endDate !== data.startDate
      ? `${data.startDate} – ${data.endDate}`
      : data.startDate;
  const time =
    data.startTime && data.endTime && data.endTime !== data.startTime
      ? `${data.startTime}–${data.endTime}`
      : data.startTime;
  const parts = [date, time, data.location].filter(isNonEmptyText);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function parsePage(html: string): ParsedPage {
  const entries: RSSEntry[] = [];
  const cardRegex = /<li\b[^>]*\bid=(['"])c\d+\1[^>]*>[\s\S]*?<\/li>/gi;
  let eventCount = 0;
  let cardMatch: RegExpExecArray | null;

  while ((cardMatch = cardRegex.exec(html)) !== null) {
    eventCount += 1;
    const card = cardMatch[0];
    const openingTag = /^<li\b[^>]*>/i.exec(card)?.[0];
    const encodedCalendarData = readHtmlAttribute(card, "data-atcb");
    if (!openingTag || !encodedCalendarData) continue;

    const relativeLink = readHtmlAttribute(openingTag, "data-url");
    const calendarData = parseCalendarData(encodedCalendarData);
    if (!relativeLink || !calendarData) continue;

    let link: string;
    try {
      link = new URL(relativeLink, BASE_URL).href;
    } catch {
      continue;
    }

    entries.push({
      id: link,
      link,
      title: calendarData.name,
      text: buildText(calendarData),
      datetime: parseDatetime(readHtmlAttribute(openingTag, "data-date-start")),
      imageURL: readHtmlAttribute(card, "data-img"),
    });
  }

  return {
    eventCount,
    entries: entries.filter(isValidRSSEntry),
    hasOngoingMarker: html.includes("viral-event-ongoing"),
    hasPastMarker: html.includes("viral-event-past"),
  };
}

function buildFeed(entries: RSSEntry[]): RSSData {
  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Agenda Cultural de Almada | Viral Agenda",
    description: "Eventos em Almada publicados na Viral Agenda",
    language: "pt",
    entries,
  };
}

export function parse(html: string): RSSData {
  return buildFeed(parsePage(html).entries);
}

function getAjaxUrl(offset: number, past: boolean, ongoing: boolean): string {
  // Viral Agenda's edge rejects a literal `page` query key for non-browser clients.
  // Encoding one character preserves the parameter after URL decoding.
  return `${BASE_URL}?ajax=1&pa%67e=${offset}&past=${past ? 1 : 0}&ongoing=${ongoing ? 1 : 0}&perpage=${PAGE_SIZE}`;
}

async function fetchResponse(fetchFn: FetchFn, url: string, ajax: boolean): Promise<Response> {
  const headers = new Headers({
    "user-agent": USERAGENT,
  });
  if (ajax) headers.set("X-Requested-With", "XMLHttpRequest");

  const response = await fetchFn(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText} - ${url}`);
  }

  return response;
}

export async function scrape(fetchFn: FetchFn): Promise<RSSData> {
  const firstResponse = await fetchResponse(
    fetchFn,
    `${BASE_URL}?perpage=${PAGE_SIZE}`,
    false,
  );
  const firstPage = parsePage(await firstResponse.text());
  const entriesById = new Map(firstPage.entries.map((entry) => [entry.id, entry]));
  let hasOngoingMarker = firstPage.hasOngoingMarker;
  let hasPastMarker = firstPage.hasPastMarker;

  if (firstPage.eventCount < PAGE_SIZE) {
    return buildFeed([...entriesById.values()]);
  }

  for (let pageIndex = 1; pageIndex < MAX_PAGES; pageIndex += 1) {
    const offset = pageIndex * PAGE_SIZE;
    const response = await fetchResponse(
      fetchFn,
      getAjaxUrl(offset, hasPastMarker, hasOngoingMarker),
      true,
    );
    const payloadResult = v.safeParse(
      ViralAgendaAjaxPayloadSchema,
      await response.json(),
    );
    if (!payloadResult.success) {
      throw new Error("Invalid Viral Agenda pagination response");
    }

    const payload: ViralAgendaAjaxPayload = payloadResult.output;
    const page = parsePage(payload.html);
    const previousEntryCount = entriesById.size;
    hasOngoingMarker ||= page.hasOngoingMarker;
    hasPastMarker ||= page.hasPastMarker;

    for (const entry of page.entries) {
      entriesById.set(entry.id, entry);
    }

    if (payload.pageTotal < PAGE_SIZE || entriesById.size === previousEntryCount) {
      break;
    }
  }

  return buildFeed([...entriesById.values()]);
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  return scrape(fetch);
}
