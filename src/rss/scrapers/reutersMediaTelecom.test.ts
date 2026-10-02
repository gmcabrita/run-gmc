import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { addScrapedRssEndpoints } from "../scrapers";
import { parse, scrape } from "./reutersMediaTelecom";
import json from "./__fixtures__/reuters-media-telecom.json";

function sentHeaders(call: Parameters<typeof fetch> | undefined): Headers {
  return new Headers(call?.[1]?.headers);
}

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

describe("reutersMediaTelecom scrape", () => {
  it("requests the API with the WhatsApp client headers and the plain relay client", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(json));

    const result = await scrape(fetcher);

    expect(result.entries).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/www\.reuters\.com\/pf\/api\/v3\/content\/fetch\/articles-by-section-alias-or-id-v1\?/,
    );
    const headers = sentHeaders(fetcher.mock.calls[0]);
    expect(headers.get("user-agent")).toBe("WhatsApp/2.23.20.0");
    expect(headers.get("accept")).toBe("*/*");
    expect(headers.get("accept-language")).toBe("en-US,en;q=0.9");
    expect(headers.get("x-relay-client")).toBe("plain");
    expect(headers.get("cookie")).toBeNull();
  });

  it("fails with the status when DataDome blocks the request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ url: "https://geo.captcha-delivery.com/captcha/" }, { status: 401 }),
    );

    await expect(scrape(fetcher)).rejects.toThrow("Reuters request failed: 401");
  });
});

describe("reutersMediaTelecom endpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the request through the relay with the WhatsApp client headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(json));
    const app = new Hono<{ Bindings: Env }>();
    addScrapedRssEndpoints(app);

    const response = await app.request("/rss.reutersMediaTelecom", undefined, {
      HTTP_RELAY_TOKEN: "relay-token",
      HTTP_RELAY_URL: "https://relay.example.com",
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    expect(String(call?.[0])).toMatch(
      /^https:\/\/relay\.example\.com\/https:\/\/www\.reuters\.com\/pf\/api\//,
    );
    const headers = sentHeaders(call);
    expect(headers.get("authorization")).toBe("Bearer relay-token");
    expect(headers.get("user-agent")).toBe("WhatsApp/2.23.20.0");
    expect(headers.get("accept")).toBe("*/*");
    expect(headers.get("accept-language")).toBe("en-US,en;q=0.9");
    expect(headers.get("x-relay-client")).toBe("plain");
  });
});
