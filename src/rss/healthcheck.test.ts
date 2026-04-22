import { describe, expect, it } from "vitest";
import {
  getRssHealthcheckPaths,
  rssFeedHasAtLeastOneEntry,
  summarizeRssHealthcheck,
} from "./healthcheck";

describe("getRssHealthcheckPaths", () => {
  it("returns rss routes except excluded ones", () => {
    expect(
      getRssHealthcheckPaths([
        { method: "GET", path: "/rss.cinecartaz" },
        { method: "GET", path: "/rss.x" },
        { method: "GET", path: "/rss.discordQuests" },
        { method: "GET", path: "/rss.sendCinecartazEntriesByEmail" },
        { method: "GET", path: "/rss.cacheAgendaLx" },
        { method: "GET", path: "/rss.agendaLx" },
        { method: "POST", path: "/rss.only-post" },
        { method: "GET", path: "/not-rss" },
        { method: "GET", path: "/rss.agendaLx" },
      ]),
    ).toEqual(["/rss.agendaLx", "/rss.cinecartaz"]);
  });
});

describe("rssFeedHasAtLeastOneEntry", () => {
  it("returns true when rss contains an item", () => {
    expect(
      rssFeedHasAtLeastOneEntry(`<?xml version="1.0"?><rss><channel><item></item></channel></rss>`),
    ).toBe(true);
  });

  it("returns false when rss contains no items", () => {
    expect(
      rssFeedHasAtLeastOneEntry(`<?xml version="1.0"?><rss><channel></channel></rss>`),
    ).toBe(false);
  });
});

describe("summarizeRssHealthcheck", () => {
  it("counts passes and returns only failures", () => {
    expect(
      summarizeRssHealthcheck([
        { url: "https://run.gmcabrita.com/rss.a", statusCode: 200, passed: true },
        { url: "https://run.gmcabrita.com/rss.b", statusCode: 502, passed: false },
        { url: "https://run.gmcabrita.com/rss.c", statusCode: 200, passed: false },
      ]),
    ).toEqual({
      summary: {
        passed: 1,
        failed: 2,
      },
      failures: [
        { url: "https://run.gmcabrita.com/rss.b", statusCode: 502 },
        { url: "https://run.gmcabrita.com/rss.c", statusCode: 200 },
      ],
    });
  });
});
