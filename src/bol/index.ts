import type { Hono } from "hono";
import { idempotentSendEmail } from "@email";
import { USERAGENT } from "@rss/common";
import { literal, looseObject, optional, safeParse, string, type InferOutput } from "valibot";
import { BOL_WATCHES } from "./watches";

const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";
const BOL_REQUEST_TIMEOUT_MS = 15_000;
// schema.org availability values that mean tickets can be bought.
const BOL_AVAILABLE_VALUES: ReadonlySet<string> = new Set([
  "https://schema.org/InStock",
  "https://schema.org/LimitedAvailability",
]);

export type BolWatch = {
  // Session dates to keep, formatted as YYYY-MM-DD. Empty or missing keeps all dates.
  date?: ReadonlyArray<string>;
  // Case and accent insensitive substring matched against event names.
  keyword: string;
  // bol.pt venue page. Each venue has its own subdomain,
  // e.g. "https://cinemasaojorge.bol.pt/".
  page: string;
};

// Venue pages embed one <script type="application/ld+json"> per event.
// The pages also carry "Product" (gift cards) and "WebSite" entries, which this
// schema rejects because of the "@type" literal.
const BolEventSchema = looseObject({
  "@type": literal("Event"),
  name: string(),
  offers: optional(looseObject({ availability: optional(string()) })),
  productID: string(),
  // Venue local time without a zone, e.g. "2026-10-24T14:00:00.0000000".
  startDate: string(),
  url: string(),
});

type BolEventJson = InferOutput<typeof BolEventSchema>;

export type BolEvent = {
  available: boolean;
  date: string;
  id: string;
  name: string;
  time: string;
  url: string;
};

export type BolWatchResult = {
  events: Array<BolEvent>;
  // Matched events that were emailed in this run. Events emailed in an
  // earlier run are skipped by the idempotency key.
  sent: Array<BolEvent>;
  watch: BolWatch;
};

export function normalizeBolText(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .trim();
}

const NAMED_HTML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

// bol.pt HTML-encodes event names inside the JSON, e.g. "&#34;TERAPIA&#34;".
export function decodeBolHtmlEntities(value: string): string {
  return value.replaceAll(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return NAMED_HTML_ENTITIES.get(code.toLowerCase()) ?? entity;
  });
}

function toBolEvent(json: BolEventJson): BolEvent {
  const availability = json.offers?.availability;
  return {
    available: availability !== undefined && BOL_AVAILABLE_VALUES.has(availability),
    date: json.startDate.slice(0, 10),
    id: json.productID,
    name: decodeBolHtmlEntities(json.name),
    time: json.startDate.slice(11, 16),
    url: json.url,
  };
}

export function parseBolEvents(html: string): Array<BolEvent> {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const events: Array<BolEvent> = [];
  for (const [, body] of scripts) {
    const parsed = safeParse(BolEventSchema, JSON.parse(body));
    if (parsed.success) {
      events.push(toBolEvent(parsed.output));
    }
  }
  return events;
}

export function filterBolEvents(events: ReadonlyArray<BolEvent>, watch: BolWatch): Array<BolEvent> {
  const keyword = normalizeBolText(watch.keyword);
  const dates = watch.date ?? [];
  return events
    .filter(
      (event) =>
        event.available &&
        normalizeBolText(event.name).includes(keyword) &&
        (dates.length === 0 || dates.includes(event.date)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The URL parser lowercases the hostname and encodes non ASCII labels as
// punycode. A trailing dot ("x.bol.pt.") names the same host, so it is removed.
export function normalizeBolHostname(page: string): string {
  return new URL(page).hostname.replace(/\.$/, "");
}

// One key per event, so each event is emailed once even when several
// watches on the same page match it.
export async function getBolIdempotencyKey(watch: BolWatch, event: BolEvent): Promise<string> {
  return `bol-${normalizeBolHostname(watch.page)}-${await sha256Hex(event.url)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildBolEmail(watch: BolWatch, event: BolEvent) {
  const host = normalizeBolHostname(watch.page);
  const subject = `[BOL] ${event.name} @ ${host}: ${event.date} ${event.time}`;
  const body = `<p><a href="${escapeHtml(event.url)}">${escapeHtml(event.name)}</a></p>
<p>${event.date} ${event.time}</p>
<p>Watch <strong>${escapeHtml(watch.keyword)}</strong> on <a href="${escapeHtml(watch.page)}">${escapeHtml(host)}</a></p>`;
  return { body, subject };
}

async function fetchBolPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "text/html", "user-agent": USERAGENT },
    signal: AbortSignal.timeout(BOL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`BOL request failed with ${response.status}: ${url}`);
  }
  return response.text();
}

// Groups watches by page URL so each page is requested once per run.
// URLs are normalized, so "https://x.bol.pt" and "https://x.bol.pt/" share a group.
export function groupBolWatchesByPage(
  watches: ReadonlyArray<BolWatch>,
): Map<string, Array<BolWatch>> {
  const groups = new Map<string, Array<BolWatch>>();
  for (const watch of watches) {
    const page = new URL(watch.page).href;
    const group = groups.get(page);
    if (group) {
      group.push(watch);
    } else {
      groups.set(page, [watch]);
    }
  }
  return groups;
}

async function notifyBolWatch(
  env: Env,
  watch: BolWatch,
  pageEvents: ReadonlyArray<BolEvent>,
): Promise<BolWatchResult> {
  const events = filterBolEvents(pageEvents, watch);
  const sent: Array<BolEvent> = [];

  for (const event of events) {
    const { body, subject } = buildBolEmail(watch, event);
    if (
      await idempotentSendEmail(env, {
        body,
        idempotencyKey: await getBolIdempotencyKey(watch, event),
        subject,
        to: NOTIFICATION_EMAIL,
      })
    ) {
      sent.push(event);
    }
  }

  return { events, sent, watch };
}

// Every watch runs even when an earlier one fails. Failures are rethrown
// together at the end so the Sentry cron monitor still records the run as failed.
export async function sendBolEventsByEmail(
  env: Env,
  watches: ReadonlyArray<BolWatch> = BOL_WATCHES,
): Promise<Array<BolWatchResult>> {
  const results: Array<BolWatchResult> = [];
  const errors: Array<Error> = [];

  for (const [page, pageWatches] of groupBolWatchesByPage(watches)) {
    let pageEvents: Array<BolEvent>;
    try {
      pageEvents = parseBolEvents(await fetchBolPage(page));
    } catch (error) {
      // Report the page failure once per watch so each failed watch is named.
      for (const watch of pageWatches) {
        errors.push(
          new Error(`BOL watch "${watch.keyword}" on ${watch.page} failed`, { cause: error }),
        );
      }
      continue;
    }

    for (const watch of pageWatches) {
      try {
        results.push(await notifyBolWatch(env, watch, pageEvents));
      } catch (error) {
        errors.push(
          new Error(`BOL watch "${watch.keyword}" on ${watch.page} failed`, { cause: error }),
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} BOL watch(es) failed`);
  }

  return results;
}

export function addBolEndpoints(app: Hono<{ Bindings: Env }>): void {
  app.get("/bol.sendEventsByEmail", async (ctx) => {
    return ctx.json(await sendBolEventsByEmail(ctx.env));
  });
}
