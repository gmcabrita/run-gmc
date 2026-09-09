import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { addScrapedRssEndpoints } from "./scrapers";
import { addXEndpoints } from "../x";

const PORTUGUESE_TITLE = "Música, audições e petições";
const CACHED_RSS = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>${PORTUGUESE_TITLE}</title></channel></rss>`;

function createRssEncodingApp() {
  const app = new Hono<{ Bindings: CloudflareBindings }>();
  addScrapedRssEndpoints(app);
  addXEndpoints(app);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RSS response encoding", () => {
  it("serves cached AgendaLX XML with an explicit UTF-8 charset", async () => {
    const response = await createRssEncodingApp().request("/rss.agendaLx", undefined, {
      RUN_GMC_GENERIC_CACHE_KV: { get: async () => CACHED_RSS },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    expect(await response.text()).toBe(CACHED_RSS);
  });

  it("serves refreshed AgendaLX XML with an explicit UTF-8 charset", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json([
        { id: 1, link: "https://example.com/event", title: { rendered: PORTUGUESE_TITLE } },
      ]),
    );
    const put = vi.fn(async () => {});
    const response = await createRssEncodingApp().request("/rss.cacheAgendaLx", undefined, {
      RUN_GMC_GENERIC_CACHE_KV: { put },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    const rss = await response.text();
    expect(rss).toContain(PORTUGUESE_TITLE);
    expect(put).toHaveBeenCalledWith("agenda-lx-eventos", rss);
  });

  it.each([true, false])(
    "serves X XML with an explicit UTF-8 charset (cached: %s)",
    async (cached) => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
        Response.json({
          data: {
            user: {
              result: {
                legacy: { name: "Example", protected: true, screen_name: "example" },
                rest_id: "1",
              },
            },
          },
        }),
      );
      const response = await createRssEncodingApp().request(
        "/rss.x?userName=example&public=true",
        { headers: { Authorization: `Basic ${btoa("test:password")}` } },
        {
          PRIVATE_BASIC_AUTH_PASSWORD: "password",
          PRIVATE_BASIC_AUTH_USERNAME: "test",
          RUN_GMC_X_CACHE_KV: {
            getWithMetadata: async () =>
              cached
                ? { metadata: { expiresAt: Date.now() + 60_000 }, value: CACHED_RSS }
                : { metadata: null, value: null },
            put: async () => {},
          },
          X_BEARER: "test-bearer",
          X1_COOKIE: "ct0=test",
          X2_COOKIE: "ct0=test",
          X3_COOKIE: "ct0=test",
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
      const rss = await response.text();
      expect(rss).toContain('<?xml version="1.0" encoding="utf-8"?>');
      if (cached) {
        expect(rss).toBe(CACHED_RSS);
      }
    },
  );
});
