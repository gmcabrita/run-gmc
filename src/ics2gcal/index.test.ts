import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { addIcs2GcalEndpoint, icsTextToGoogleCalendarUrl } from "./index";

function googleUrlFrom(text: string): URL {
  const result = icsTextToGoogleCalendarUrl(text);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {throw new Error(result.message);}
  return new URL(result.url);
}

describe("icsTextToGoogleCalendarUrl", () => {
  it("returns a Google Calendar URL for the first event", () => {
    const url = googleUrlFrom(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Coffee\\, sync
DESCRIPTION:Line one\\nLine two
LOCATION:Lisbon\\; PT
DTSTART;TZID=Europe/Lisbon:20260512T093000
DTEND;TZID=Europe/Lisbon:20260512T100000
ATTENDEE:mailto:one@example.com
ATTENDEE:mailto:two@example.com
RRULE:FREQ=WEEKLY;COUNT=2
END:VEVENT
END:VCALENDAR`);

    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.pathname).toBe("/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Coffee, sync");
    expect(url.searchParams.get("details")).toBe("Line one\nLine two");
    expect(url.searchParams.get("location")).toBe("Lisbon; PT");
    expect(url.searchParams.get("dates")).toBe("20260512T093000/20260512T100000");
    expect(url.searchParams.get("ctz")).toBe("Europe/Lisbon");
    expect(url.searchParams.get("add")).toBe("one@example.com,two@example.com");
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY;COUNT=2");
  });

  it("unfolds folded lines", () => {
    const url = googleUrlFrom(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Very long
  title
DTSTART:20260512T093000Z
DTEND:20260512T100000Z
END:VEVENT
END:VCALENDAR`);

    expect(url.searchParams.get("text")).toBe("Very long title");
  });

  it("prefers DTSTART and derives timed end from duration", () => {
    const url = googleUrlFrom(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Workout
DTSTART:20260512T093000Z
DTSTAMP:20260829T180000
DURATION:PT45M
END:VEVENT
END:VCALENDAR`);

    expect(url.searchParams.get("dates")).toBe("20260512T093000Z/20260512T101500Z");
  });

  it("uses DTSTAMP with a valid duration when DTSTART is absent", () => {
    const url = googleUrlFrom(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:BOL - Evento: "Rebeldes sem Causas | West Side Story"
DTSTAMP:20260829T180000
DURATION:PT2H31M
END:VEVENT
END:VCALENDAR`);

    expect(url.searchParams.get("dates")).toBe("20260829T180000/20260829T203100");
  });

  it.each(["", "DURATION:P", "DURATION:not-a-duration"])(
    "does not use DTSTAMP without a valid duration (%s)",
    (durationLine) => {
      const url = googleUrlFrom(`BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTAMP:20260829T180000
${durationLine}
END:VEVENT
END:VCALENDAR`);

      expect(url.searchParams.get("dates")).toBeNull();
    },
  );

  it("derives all-day end from duration", () => {
    const url = googleUrlFrom(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Trip
DTSTART;VALUE=DATE:20260512
DURATION:P2D
END:VEVENT
END:VCALENDAR`);

    expect(url.searchParams.get("dates")).toBe("20260512/20260514");
  });

  it("returns an error for empty input", () => {
    expect(icsTextToGoogleCalendarUrl("  ")).toEqual({
      message: "No ICS text provided.",
      status: "error",
    });
  });

  it("returns an error when there are no events", () => {
    expect(icsTextToGoogleCalendarUrl("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual({
      message: "No VEVENT found in this ICS file.",
      status: "error",
    });
  });
});

describe("addIcs2GcalEndpoint", () => {
  it("serves POST /ics2gcal as plaintext", async () => {
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    addIcs2GcalEndpoint(app);

    const response = await app.request("/ics2gcal", {
      body: `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Coffee
DTSTART:20260512T093000Z
DTEND:20260512T100000Z
END:VEVENT
END:VCALENDAR`,
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Coffee&dates=20260512T093000Z%2F20260512T100000Z",
    );
  });

  it("returns 400 for invalid ICS plaintext", async () => {
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    addIcs2GcalEndpoint(app);

    const response = await app.request("/ics2gcal", {
      body: "BEGIN:VCALENDAR\nEND:VCALENDAR",
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("No VEVENT found in this ICS file.");
  });
});
