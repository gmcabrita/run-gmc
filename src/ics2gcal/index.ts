import type { Hono } from "hono";

const textProperties = new Set(["SUMMARY", "DESCRIPTION", "LOCATION"]);

type IcsProperty = {
  name: string;
  params: Map<string, string>;
  value: string;
};

type IcsEvent = {
  properties: Array<IcsProperty>;
};

type GoogleCalendarEvent = {
  attendees: Array<string>;
  end: string;
  start: string;
  timezone: string;
  title: string;
  url: string;
};

export type IcsToGoogleCalendarUrlResult =
  | { status: "ok"; url: string }
  | { message: string; status: "error"; };

function splitParamValue(part: string): [string, string] {
  const index = part.indexOf("=");
  if (index === -1) {return [part.toUpperCase(), ""];}
  return [part.slice(0, index).toUpperCase(), unquoteParam(part.slice(index + 1))];
}

function unquoteParam(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {return value.slice(1, -1);}
  return value;
}

function parseLine(line: string): IcsProperty | undefined {
  const colon = line.indexOf(":");
  if (colon === -1) {return;}

  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const name = parts[0].toUpperCase();
  const params = new Map(parts.slice(1).map(splitParamValue));

  return { name, params, value };
}

function unescapeIcsText(value: string): string {
  return value
    .replaceAll(/\\[nN]/g, "\n")
    .replaceAll(String.raw`\,`, ",")
    .replaceAll(String.raw`\;`, ";")
    .replaceAll(String.raw`\\`, "\\");
}

function unfoldIcs(text: string): string {
  return text.replaceAll(/\r?\n[ \t]/g, "");
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
  if (!match || match.slice(1).every((part) => part === undefined)) {return;}

  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const minutes = Number(match[4] || 0);
  const seconds = Number(match[5] || 0);
  return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds;
}

function addSecondsToIcsDate(value: string, seconds: number): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!match) {return value;}

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
  if (!prop) {return "";}
  return prop.value.replaceAll(/[-:]/g, "");
}

function isAllDay(prop: IcsProperty | undefined): boolean {
  if (!prop) {return false;}
  return prop.params.get("VALUE") === "DATE" || /^\d{8}$/.test(prop.value);
}

function firstProperty(event: IcsEvent, name: string): IcsProperty | undefined {
  return event.properties.find((property) => property.name === name);
}

function allProperties(event: IcsEvent, name: string): Array<IcsProperty> {
  return event.properties.filter((property) => property.name === name);
}

function parseIcsEvents(text: string): Array<IcsEvent> {
  const lines = unfoldIcs(text).split(/\r?\n/);
  const events: Array<IcsEvent> = [];
  let active: IcsEvent | undefined;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      active = { properties: [] };
      continue;
    }

    if (line === "END:VEVENT") {
      if (active) {events.push(active);}
      active = undefined;
      continue;
    }

    if (!active) {continue;}

    const property = parseLine(line);
    if (!property) {continue;}

    if (textProperties.has(property.name)) {
      active.properties.push({ ...property, value: unescapeIcsText(property.value) });
    } else {
      active.properties.push(property);
    }
  }

  return events;
}

function getEventStart(
  event: IcsEvent,
  durationSeconds: number | undefined,
): IcsProperty | undefined {
  const declaredStart = firstProperty(event, "DTSTART");
  if (declaredStart || durationSeconds === undefined) {return declaredStart;}
  return firstProperty(event, "DTSTAMP");
}

function getEventEndValue(
  start: IcsProperty | undefined,
  startValue: string,
  declaredEnd: IcsProperty | undefined,
  durationSeconds: number | undefined,
): string {
  const endValue = normalizeDateValue(declaredEnd);
  if (endValue || !startValue) {return endValue;}

  if (durationSeconds !== undefined) {
    return isAllDay(start)
      ? addDays(startValue, Math.max(1, Math.round(durationSeconds / 86_400)))
      : addSecondsToIcsDate(startValue, durationSeconds);
  }

  return isAllDay(start) ? addDays(startValue, 1) : addSecondsToIcsDate(startValue, 3600);
}

function getEventAttendees(event: IcsEvent): Array<string> {
  return allProperties(event, "ATTENDEE")
    .map((attendee) => attendee.value.replace(/^mailto:/i, "").trim())
    .filter(Boolean);
}

function getEventTimezone(start: IcsProperty | undefined): string {
  if (!start) {return "";}
  return start.params.get("TZID") || "";
}

type GoogleCalendarParams = {
  attendees: ReadonlyArray<string>;
  description: IcsProperty | undefined;
  endValue: string;
  location: IcsProperty | undefined;
  rrule: IcsProperty | undefined;
  startValue: string;
  timezone: string;
  title: string;
};

function addGoogleCalendarProperty(
  params: URLSearchParams,
  key: string,
  property: IcsProperty | undefined,
  valuePrefix = "",
): void {
  if (property?.value) {params.set(key, `${valuePrefix}${property.value}`);}
}

function createGoogleCalendarParams(options: GoogleCalendarParams): URLSearchParams {
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", options.title);
  if (options.startValue && options.endValue) {
    params.set("dates", `${options.startValue}/${options.endValue}`);
  }
  addGoogleCalendarProperty(params, "details", options.description);
  addGoogleCalendarProperty(params, "location", options.location);
  if (options.attendees.length > 0) {params.set("add", options.attendees.join(","));}
  if (options.timezone && options.startValue && !options.startValue.endsWith("Z")) {
    params.set("ctz", options.timezone);
  }
  addGoogleCalendarProperty(params, "recur", options.rrule, "RRULE:");
  return params;
}

function eventToGoogleCalendarUrl(event: IcsEvent): GoogleCalendarEvent {
  const summary = firstProperty(event, "SUMMARY");
  const duration = firstProperty(event, "DURATION");
  const durationSeconds = duration ? parseDuration(duration.value) : undefined;
  const start = getEventStart(event, durationSeconds);
  const startValue = normalizeDateValue(start);
  const endValue = getEventEndValue(
    start,
    startValue,
    firstProperty(event, "DTEND"),
    durationSeconds,
  );
  const attendees = getEventAttendees(event);
  const timezone = getEventTimezone(start);
  const title = summary ? summary.value : "Untitled event";
  const params = createGoogleCalendarParams({
    attendees,
    description: firstProperty(event, "DESCRIPTION"),
    endValue,
    location: firstProperty(event, "LOCATION"),
    rrule: firstProperty(event, "RRULE"),
    startValue,
    timezone,
    title,
  });

  return {
    attendees,
    end: endValue,
    start: startValue,
    timezone,
    title,
    url: `https://calendar.google.com/calendar/render?${params.toString()}`,
  };
}

export function icsTextToGoogleCalendarUrl(text: string): IcsToGoogleCalendarUrlResult {
  if (!text.trim()) {
    return { message: "No ICS text provided.", status: "error" };
  }

  const event = parseIcsEvents(text)[0];
  if (!event) {
    return { message: "No VEVENT found in this ICS file.", status: "error" };
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
