import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { addScrapedRssEndpoints } from "../scrapers";
import { parse } from "./reutersMediaTelecom";
import json from "./__fixtures__/reuters-media-telecom.json";

const relayEnv = {
  HTTP_RELAY_TOKEN: "relay-token",
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
};

function createDataDomeResponse(): Response {
  return Response.json({ url: "https://geo.captcha-delivery.com/captcha/" }, { status: 401 });
}

function requestRss(env: Record<string, string>) {
  const app = new Hono<{ Bindings: Env }>();
  addScrapedRssEndpoints(app);
  app.onError((error, ctx) => ctx.text(error.message, 502));
  return app.request("/rss.reutersMediaTelecom", undefined, env);
}

function sentHeaders(call: Parameters<typeof fetch>): Headers {
  return new Request(call[0], call[1]).headers;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reutersMediaTelecom parser", () => {
  it("parses Reuters section articles", () => {
    const result = parse(json);

    expect(result.id).toBe("https://www.reuters.com/business/media-telecom/");
    expect(result.link).toBe("https://www.reuters.com/business/media-telecom/");
    expect(result.title).toBe("Reuters - Media & Telecom");
    expect(result.description).toBe("Reuters Media & Telecom news");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(2);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("abc123");
    expect(firstEntry.link).toBe(
      "https://www.reuters.com/business/media-telecom/test-title-2026-03-09/",
    );
    expect(firstEntry.title).toBe("Test Reuters Title");
    expect(firstEntry.text).toBe("Test Reuters description.");
    expect(firstEntry.datetime).toEqual(new Date("2026-03-09T08:06:42.482Z"));
    expect(firstEntry.imageURL).toBe("https://example.com/image.jpg");
  });

  it("falls back to alternate headline and updated time", () => {
    const result = parse(json);
    const fallbackEntry = result.entries.find((entry) => entry.id === "def456");

    expect(fallbackEntry).toBeDefined();
    expect(fallbackEntry?.title).toBe("Fallback Headline");
    expect(fallbackEntry?.text).toBe("Fallback Headline");
    expect(fallbackEntry?.datetime).toEqual(new Date("2026-03-08T10:00:00Z"));
    expect(fallbackEntry?.imageURL).toBeUndefined();
  });

  it("filters articles without canonical urls", () => {
    const result = parse(json);

    expect(result.entries.find((entry) => entry.id === "ghi789")).toBeUndefined();
  });

  it("keeps articles with malformed optional fields", () => {
    const result = parse({
      result: {
        articles: [
          {
            basic_headline: "Tolerant headline",
            canonical_url: "/business/media-telecom/tolerant-entry/",
            description: { invalid: true },
            id: "tolerant-entry",
            published_time: false,
            thumbnail: { url: 99 },
            title: 42,
            updated_time: "2025-01-01T12:00:00Z",
          },
        ],
      },
    });

    expect(result.entries).toEqual([
      {
        datetime: new Date("2025-01-01T12:00:00Z"),
        id: "tolerant-entry",
        imageURL: undefined,
        link: "https://www.reuters.com/business/media-telecom/tolerant-entry/",
        text: "Tolerant headline",
        title: "Tolerant headline",
      },
    ]);
  });
});

describe("reutersMediaTelecom fetch", () => {
  it("sends the DataDome cookie and a browser User-Agent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(json));

    const response = await requestRss({ ...relayEnv, REUTERS_DATADOME_COOKIE: "cookie-value" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = sentHeaders(fetchSpy.mock.calls[0]);
    expect(headers.get("cookie")).toBe("datadome=cookie-value");
    expect(headers.get("user-agent")).toContain("Chrome/");
  });

  it("retries without the cookie when the cookie request fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createDataDomeResponse())
      .mockResolvedValueOnce(Response.json(json));

    const response = await requestRss({ ...relayEnv, REUTERS_DATADOME_COOKIE: "expired" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentHeaders(fetchSpy.mock.calls[0]).get("cookie")).toBe("datadome=expired");
    expect(sentHeaders(fetchSpy.mock.calls[1]).get("cookie")).toBeNull();
  });

  it("fails when both requests are blocked", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => createDataDomeResponse());

    const response = await requestRss({ ...relayEnv, REUTERS_DATADOME_COOKIE: "expired" });

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Reuters request failed: 401 (with DataDome cookie: 401)");
  });

  it("keeps the cookie status when the retry without cookie throws", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createDataDomeResponse())
      .mockRejectedValue(new Error("network down"));

    const response = await requestRss({ ...relayEnv, REUTERS_DATADOME_COOKIE: "expired" });

    expect(response.status).toBe(502);
    expect(await response.text()).toBe(
      "Reuters request failed without cookie (with DataDome cookie: 401)",
    );
  });

  it("requests once without a cookie when the secret is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createDataDomeResponse());

    const response = await requestRss(relayEnv);

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Reuters request failed: 401");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sentHeaders(fetchSpy.mock.calls[0]).get("cookie")).toBeNull();
  });
});
