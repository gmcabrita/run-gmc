import type { Hono } from "hono";
import { idempotentSendEmail } from "@email";
import { USERAGENT } from "@rss/common";
import {
  array,
  fallback,
  looseObject,
  number,
  optional,
  parse as parseValibot,
  safeParse,
  string,
  type GenericSchema,
  type InferOutput,
} from "valibot";
import { NOS_CINEMAS_WATCHES } from "./watches";

const NOS_CINEMAS_ORIGIN = "https://www.cinemas.nos.pt";
// Search result paths carry the AEM content root; the public URL drops it.
const NOS_CINEMAS_CONTENT_ROOT = "/content/cinemas/language-masters/pt";
const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";
// The search endpoint returns at most this many results per resultsOffset page.
const NOS_CINEMAS_SEARCH_PAGE_SIZE = 10;
// Upper bound on search pages per keyword so a broad keyword cannot run away.
const NOS_CINEMAS_SEARCH_MAX_PAGES = 5;
const NOS_CINEMAS_REQUEST_TIMEOUT_MS = 15_000;
// cinemas.nos.pt intermittently times out or returns 5xx. Each request is
// retried this many times with exponential backoff before the watch fails.
const NOS_CINEMAS_REQUEST_RETRY_COUNT = 3;
const NOS_CINEMAS_REQUEST_RETRY_BASE_DELAY_MS = 1000;

export type NosCinemasWatch = {
  // Session dates to keep, formatted as YYYY-MM-DD. Empty or missing keeps all dates.
  date?: ReadonlyArray<string>;
  // Fulltext search term sent to cinemas.nos.pt.
  keyword: string;
  // Case and accent insensitive substrings matched against theater names,
  // e.g. "colombo" matches "Cinemas NOS Colombo". Empty or missing keeps all venues.
  venue?: ReadonlyArray<string>;
};

const NosCinemasSearchResultsSchema = array(
  looseObject({
    title: string(),
    url: string(),
  }),
);

const NosCinemasSessionSchema = looseObject({
  description: string(),
  format: string(),
  // Formatted as "YYYY-MM-DDZ".
  operationalDate: string(),
  time: string(),
  type: string(),
  uuid: string(),
  version: string(),
});

const NosCinemasMovieSessionsSchema = looseObject({
  days: optional(
    array(
      looseObject({
        name: string(),
        theaters: array(
          looseObject({
            name: string(),
            sessions: array(NosCinemasSessionSchema),
            theaterId: string(),
          }),
        ),
      }),
    ),
  ),
});

export type NosCinemasSearchResults = InferOutput<typeof NosCinemasSearchResultsSchema>;
export type NosCinemasMovieSessions = InferOutput<typeof NosCinemasMovieSessionsSchema>;

export type NosCinemasMovie = {
  aggregateFormatNumber: string;
  title: string;
  url: string;
};

export type NosCinemasMatchedSession = {
  date: string;
  format: string;
  room: string;
  theater: string;
  time: string;
  type: string;
  uuid: string;
  version: string;
};

export type NosCinemasMatch = {
  movie: NosCinemasMovie;
  sessions: Array<NosCinemasMatchedSession>;
};

export function normalizeNosCinemasText(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .trim();
}

export function getNosCinemasSearchUrl(keyword: string, resultsOffset = 0): string {
  const url = new URL(
    "/content/cinemas/language-masters/pt/cinemas.searchresults.json/_jcr_content/root/header/search",
    NOS_CINEMAS_ORIGIN,
  );
  url.searchParams.set("fulltext", `${keyword}*`);
  url.searchParams.set("resultsOffset", String(resultsOffset));
  return url.href;
}

export function getNosCinemasMovieSessionsUrl(aggregateFormatNumber: string): string {
  const url = new URL(
    "/bin/cinemas/render/getMovieSessions.getMovieSessionsAggregator.json",
    NOS_CINEMAS_ORIGIN,
  );
  url.searchParams.set("aggregateMovieId", aggregateFormatNumber);
  return url.href;
}

// Converts a search result URL such as
// "/content/cinemas/language-masters/pt/filmes/dune---duna--parte-tres-.html"
// into the public page URL "https://www.cinemas.nos.pt/filmes/dune---duna--parte-tres-".
export function getNosCinemasMoviePageUrl(searchResultUrl: string): string {
  const path = searchResultUrl.replace(NOS_CINEMAS_CONTENT_ROOT, "").replace(/\.html$/, "");
  return new URL(path, NOS_CINEMAS_ORIGIN).href;
}

export function parseNosCinemasSearchResults(
  results: NosCinemasSearchResults,
): Array<{ title: string; url: string }> {
  return results.map((result) => ({
    title: result.title,
    url: getNosCinemasMoviePageUrl(result.url),
  }));
}

export function extractNosCinemasAggregateFormatNumbers(html: string): Array<string> {
  const matches = html.matchAll(/data-aggregateformatnumber="([A-Za-z0-9-]+)"/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

// cinemas.nos.pt declares utf-8 on the sessions endpoint but sends ISO-8859-1
// bytes for theater names such as "Palácio do Gelo". Strict utf-8 decoding
// detects that case so the fallback decoder can recover the accents.
export function decodeNosCinemasBody(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

function matchesWatchDate(operationalDate: string, dates: ReadonlyArray<string>): boolean {
  if (dates.length === 0) {
    return true;
  }
  const sessionDate = operationalDate.slice(0, 10);
  return dates.includes(sessionDate);
}

function matchesWatchVenue(theaterName: string, venues: ReadonlyArray<string>): boolean {
  if (venues.length === 0) {
    return true;
  }
  const normalizedTheater = normalizeNosCinemasText(theaterName);
  return venues.some((venue) => normalizedTheater.includes(normalizeNosCinemasText(venue)));
}

export function filterNosCinemasSessions(
  payload: NosCinemasMovieSessions,
  watch: NosCinemasWatch,
): Array<NosCinemasMatchedSession> {
  const dates = watch.date ?? [];
  const venues = watch.venue ?? [];
  const matched: Array<NosCinemasMatchedSession> = [];

  for (const day of payload.days ?? []) {
    for (const theater of day.theaters) {
      if (!matchesWatchVenue(theater.name, venues)) {
        continue;
      }
      for (const session of theater.sessions) {
        if (!matchesWatchDate(session.operationalDate, dates)) {
          continue;
        }
        matched.push({
          date: session.operationalDate.slice(0, 10),
          format: session.format,
          room: session.description,
          theater: theater.name,
          time: session.time,
          type: session.type,
          uuid: session.uuid,
          version: session.version,
        });
      }
    }
  }

  return matched.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.theater.localeCompare(b.theater) ||
      a.time.localeCompare(b.time),
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The key changes whenever the set of matching sessions changes, so a new
// email goes out when sessions are added or removed for a watch.
export async function getNosCinemasIdempotencyKey(
  watch: NosCinemasWatch,
  matches: ReadonlyArray<NosCinemasMatch>,
): Promise<string> {
  const uuids = matches
    .flatMap((match) => match.sessions.map((session) => session.uuid))
    .sort((a, b) => a.localeCompare(b));
  const hash = await sha256Hex(uuids.join(","));
  return `nos-cinemas-${normalizeNosCinemasText(watch.keyword).replaceAll(/\s+/g, "-")}-${hash}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function describeWatchFilters(watch: NosCinemasWatch): string {
  const parts: Array<string> = [];
  if (watch.date && watch.date.length > 0) {
    parts.push(`dates: ${watch.date.join(", ")}`);
  }
  if (watch.venue && watch.venue.length > 0) {
    parts.push(`venues: ${watch.venue.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "no filters";
}

export function buildNosCinemasEmail(
  watch: NosCinemasWatch,
  matches: ReadonlyArray<NosCinemasMatch>,
) {
  const sessionCount = matches.reduce((total, match) => total + match.sessions.length, 0);
  const subject = `[NOS Cinemas] ${watch.keyword}: ${sessionCount} session${sessionCount === 1 ? "" : "s"} available`;

  const sections = matches.map((match) => {
    const rows = match.sessions
      .map(
        (session) =>
          `<tr><td>${session.date}</td><td>${session.time}</td><td>${escapeHtml(session.theater)}</td><td>${escapeHtml(session.room)}</td><td>${escapeHtml(session.format)} ${escapeHtml(session.version)} ${escapeHtml(session.type)}</td></tr>`,
      )
      .join("\n");
    return `<h2><a href="${match.movie.url}">${escapeHtml(match.movie.title)}</a></h2>
<table border="1" cellpadding="4" cellspacing="0">
<tr><th>Date</th><th>Time</th><th>Theater</th><th>Room</th><th>Format</th></tr>
${rows}
</table>`;
  });

  const body = `<p>Watch <strong>${escapeHtml(watch.keyword)}</strong> (${escapeHtml(describeWatchFilters(watch))})</p>
${sections.join("\n")}`;

  return { body, subject };
}

class NosCinemasRequestError extends Error {
  readonly status: number;

  constructor(url: string, status: number) {
    super(`NOS Cinemas request failed with ${status}: ${url}`);
    this.name = "NosCinemasRequestError";
    this.status = status;
  }
}

// Shape of a caught request failure. `name` covers DOMException timeouts and
// TypeError network failures; `status` is set by NosCinemasRequestError.
const NosCinemasRequestFailureSchema = looseObject({
  name: fallback(string(), ""),
  status: optional(number()),
});

type NosCinemasRequestFailure = InferOutput<typeof NosCinemasRequestFailureSchema>;

// Timeouts, network failures, and server side errors are transient.
// Client errors (4xx) and parse failures are not, so they fail immediately.
export function isRetryableNosCinemasFailure(failure: NosCinemasRequestFailure): boolean {
  if (failure.status !== undefined) {
    return failure.status >= 500 || failure.status === 429;
  }
  return (
    failure.name === "TimeoutError" || failure.name === "AbortError" || failure.name === "TypeError"
  );
}

export async function retryNosCinemasRequest<T>(
  request: () => Promise<T>,
  options: {
    retryCount?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const retryCount = options.retryCount ?? NOS_CINEMAS_REQUEST_RETRY_COUNT;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      const failure = safeParse(NosCinemasRequestFailureSchema, error);
      if (
        !failure.success ||
        !isRetryableNosCinemasFailure(failure.output) ||
        attempt >= retryCount
      ) {
        throw error;
      }
      await sleep(NOS_CINEMAS_REQUEST_RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
}

async function fetchNosCinemasResponse(url: string, accept: string): Promise<Response> {
  return retryNosCinemasRequest(async () => {
    const response = await fetch(url, {
      headers: { accept, "user-agent": USERAGENT },
      signal: AbortSignal.timeout(NOS_CINEMAS_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new NosCinemasRequestError(url, response.status);
    }
    return response;
  });
}

async function fetchNosCinemasJson<TSchema extends GenericSchema>(
  url: string,
  schema: TSchema,
): Promise<InferOutput<TSchema>> {
  const response = await fetchNosCinemasResponse(url, "application/json");
  return parseValibot(schema, JSON.parse(decodeNosCinemasBody(await response.arrayBuffer())));
}

async function fetchNosCinemasHtml(url: string): Promise<string> {
  const response = await fetchNosCinemasResponse(url, "text/html");
  return response.text();
}

// Several search results (2D, IMAX, 4DX, ...) usually share one aggregate id,
// so the returned list is deduplicated by aggregateFormatNumber and keeps the
// shortest title for each id, which is the plain movie name without a format suffix.
async function searchNosCinemas(keyword: string): Promise<Array<{ title: string; url: string }>> {
  const results: Array<{ title: string; url: string }> = [];

  for (let page = 0; page < NOS_CINEMAS_SEARCH_MAX_PAGES; page++) {
    const pageResults = parseNosCinemasSearchResults(
      await fetchNosCinemasJson(
        getNosCinemasSearchUrl(keyword, page * NOS_CINEMAS_SEARCH_PAGE_SIZE),
        NosCinemasSearchResultsSchema,
      ),
    );
    results.push(...pageResults);
    if (pageResults.length < NOS_CINEMAS_SEARCH_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

export async function findNosCinemasMovies(keyword: string): Promise<Array<NosCinemasMovie>> {
  const results = await searchNosCinemas(keyword);
  const movies = new Map<string, NosCinemasMovie>();

  for (const result of results) {
    const html = await fetchNosCinemasHtml(result.url);
    for (const aggregateFormatNumber of extractNosCinemasAggregateFormatNumbers(html)) {
      const existing = movies.get(aggregateFormatNumber);
      if (!existing || result.title.length < existing.title.length) {
        movies.set(aggregateFormatNumber, {
          aggregateFormatNumber,
          title: result.title,
          url: result.url,
        });
      }
    }
  }

  return [...movies.values()];
}

export async function findNosCinemasMatches(
  watch: NosCinemasWatch,
): Promise<Array<NosCinemasMatch>> {
  const movies = await findNosCinemasMovies(watch.keyword);
  const matches: Array<NosCinemasMatch> = [];

  for (const movie of movies) {
    const sessions = filterNosCinemasSessions(
      await fetchNosCinemasJson(
        getNosCinemasMovieSessionsUrl(movie.aggregateFormatNumber),
        NosCinemasMovieSessionsSchema,
      ),
      watch,
    );
    if (sessions.length > 0) {
      matches.push({ movie, sessions });
    }
  }

  return matches;
}

async function notifyNosCinemasWatch(
  env: CloudflareBindings,
  watch: NosCinemasWatch,
): Promise<NosCinemasWatchResult> {
  const matches = await findNosCinemasMatches(watch);
  if (matches.length === 0) {
    return { matches, sent: false, watch };
  }

  const { body, subject } = buildNosCinemasEmail(watch, matches);
  const sent = await idempotentSendEmail(env, {
    body,
    idempotencyKey: await getNosCinemasIdempotencyKey(watch, matches),
    subject,
    to: NOTIFICATION_EMAIL,
  });
  return { matches, sent, watch };
}

export type NosCinemasWatchResult = {
  matches: Array<NosCinemasMatch>;
  sent: boolean;
  watch: NosCinemasWatch;
};

// Every watch runs even when an earlier one fails. Failures are rethrown
// together at the end so the Sentry cron monitor still records the run as failed.
export async function sendNosCinemasSessionsByEmail(
  env: CloudflareBindings,
  watches: ReadonlyArray<NosCinemasWatch> = NOS_CINEMAS_WATCHES,
): Promise<Array<NosCinemasWatchResult>> {
  const results: Array<NosCinemasWatchResult> = [];
  const errors: Array<Error> = [];

  for (const watch of watches) {
    try {
      results.push(await notifyNosCinemasWatch(env, watch));
    } catch (error) {
      errors.push(new Error(`NOS Cinemas watch "${watch.keyword}" failed`, { cause: error }));
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} NOS Cinemas watch(es) failed`);
  }

  return results;
}

export function addNosCinemasEndpoints(app: Hono<{ Bindings: CloudflareBindings }>): void {
  app.get("/nosCinemas.sendMovieSessionsByEmail", async (ctx) => {
    return ctx.json(await sendNosCinemasSessionsByEmail(ctx.env));
  });
}
