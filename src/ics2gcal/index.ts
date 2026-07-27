import type { Hono } from "hono";

const textProperties = new Set(["SUMMARY", "DESCRIPTION", "LOCATION"]);

type IcsProperty = {
  name: string;
  params: Map<string, string>;
  value: string;
};

type IcsEvent = {
  properties: IcsProperty[];
};

type GoogleCalendarEvent = {
  title: string;
  start: string;
  end: string;
  timezone: string;
  attendees: string[];
  url: string;
};

export type IcsToGoogleCalendarUrlResult =
  | { status: "ok"; url: string }
  | { status: "error"; message: string };

function splitParamValue(part: string): [string, string] {
  const index = part.indexOf("=");
  if (index === -1) return [part.toUpperCase(), ""];
  return [part.slice(0, index).toUpperCase(), unquoteParam(part.slice(index + 1))];
}

function unquoteParam(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function parseLine(line: string): IcsProperty | undefined {
  const colon = line.indexOf(":");
  if (colon === -1) return;

  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const name = parts[0].toUpperCase();
  const params = new Map(parts.slice(1).map(splitParamValue));

  return { name, params, value };
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldIcs(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

function addDays(yyyymmdd: string, days: number): string {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function parseDuration(duration: string): number | undefined {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    duration,
  );
  if (!match || match.slice(1).every((part) => part === undefined)) return;

  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const minutes = Number(match[4] || 0);
  const seconds = Number(match[5] || 0);
  return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds;
}

function addSecondsToIcsDate(value: string, seconds: number): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!match) return value;

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]) + seconds,
    ),
  );

  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}${match[7]}`;
}

function normalizeDateValue(prop: IcsProperty | undefined): string {
  if (!prop) return "";
  return prop.value.replace(/[-:]/g, "");
}

function isAllDay(prop: IcsProperty | undefined): boolean {
  if (!prop) return false;
  return prop.params.get("VALUE") === "DATE" || /^\d{8}$/.test(prop.value);
}

function firstProperty(event: IcsEvent, name: string): IcsProperty | undefined {
  return event.properties.find((property) => property.name === name);
}

function allProperties(event: IcsEvent, name: string): IcsProperty[] {
  return event.properties.filter((property) => property.name === name);
}

function parseIcsEvents(text: string): IcsEvent[] {
  const lines = unfoldIcs(text).split(/\r?\n/);
  const events: IcsEvent[] = [];
  let active: IcsEvent | undefined;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      active = { properties: [] };
      continue;
    }

    if (line === "END:VEVENT") {
      if (active) events.push(active);
      active = undefined;
      continue;
    }

    if (!active) continue;

    const property = parseLine(line);
    if (!property) continue;

    if (textProperties.has(property.name)) {
      active.properties.push({ ...property, value: unescapeIcsText(property.value) });
    } else {
      active.properties.push(property);
    }
  }

  return events;
}

function eventToGoogleCalendarUrl(event: IcsEvent): GoogleCalendarEvent {
  const summary = firstProperty(event, "SUMMARY");
  const description = firstProperty(event, "DESCRIPTION");
  const location = firstProperty(event, "LOCATION");
  const declaredStart = firstProperty(event, "DTSTART");
  const end = firstProperty(event, "DTEND");
  const duration = firstProperty(event, "DURATION");
  const durationSeconds = duration ? parseDuration(duration.value) : undefined;
  const start =
    declaredStart ??
    (durationSeconds !== undefined ? firstProperty(event, "DTSTAMP") : undefined);
  const rrule = firstProperty(event, "RRULE");

  const startValue = normalizeDateValue(start);
  let endValue = normalizeDateValue(end);

  if (!endValue && startValue) {
    if (durationSeconds !== undefined && !isAllDay(start)) {
      endValue = addSecondsToIcsDate(startValue, durationSeconds);
    }
    if (durationSeconds !== undefined && isAllDay(start)) {
      endValue = addDays(startValue, Math.max(1, Math.round(durationSeconds / 86400)));
    }
    if (!endValue && isAllDay(start)) endValue = addDays(startValue, 1);
    if (!endValue) endValue = addSecondsToIcsDate(startValue, 3600);
  }

  const attendees = allProperties(event, "ATTENDEE")
    .map((attendee) => attendee.value.replace(/^mailto:/i, "").trim())
    .filter(Boolean);

  const timezone = start ? start.params.get("TZID") || "" : "";
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", summary ? summary.value : "Untitled event");
  if (startValue && endValue) params.set("dates", `${startValue}/${endValue}`);
  if (description && description.value) params.set("details", description.value);
  if (location && location.value) params.set("location", location.value);
  if (attendees.length > 0) params.set("add", attendees.join(","));
  if (timezone && startValue && !startValue.endsWith("Z")) params.set("ctz", timezone);
  if (rrule && rrule.value) params.set("recur", `RRULE:${rrule.value}`);

  return {
    title: summary ? summary.value : "Untitled event",
    start: startValue,
    end: endValue,
    timezone,
    attendees,
    url: `https://calendar.google.com/calendar/render?${params.toString()}`,
  };
}

export function icsTextToGoogleCalendarUrl(text: string): IcsToGoogleCalendarUrlResult {
  if (!text.trim()) {
    return { status: "error", message: "No ICS text provided." };
  }

  const event = parseIcsEvents(text)[0];
  if (!event) {
    return { status: "error", message: "No VEVENT found in this ICS file." };
  }

  return { status: "ok", url: eventToGoogleCalendarUrl(event).url };
}

export function addIcs2GcalEndpoint(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.post("/ics2gcal", async (ctx) => {
    const result = icsTextToGoogleCalendarUrl(await ctx.req.text());

    if (result.status === "error") {
      ctx.status(400);
      return ctx.text(result.message);
    }

    return ctx.text(result.url);
  });
}
