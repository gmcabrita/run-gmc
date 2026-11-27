import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LETTERBOXD_EXPORT_KV_KEY,
  LETTERBOXD_REJECTED_COOKIE_KV_KEY,
  getLetterboxdExport,
} from "./index";

const testEnv = { ...env, LETTERBOXD_COOKIE: "session-cookie" };
const OLD_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01]);
const NEW_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x02]);
const NOW = Date.parse("2026-11-27T12:00:00Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function zipResponse(bytes: Uint8Array = NEW_ZIP) {
  return new Response(bytes, { headers: { "content-type": "application/zip;charset=ISO-8859-1" } });
}

function signedOutResponse() {
  return new Response("<html>Sign in</html>", {
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}

function cacheZip(bytes: Uint8Array, downloadedAt: number) {
  return env.RUN_GMC_GENERIC_CACHE_KV.put(LETTERBOXD_EXPORT_KV_KEY, bytes, {
    metadata: { downloadedAt },
  });
}

function bytes(buffer: ArrayBuffer | null) {
  return buffer === null ? null : new Uint8Array(buffer);
}

describe("getLetterboxdExport", () => {
  beforeEach(async () => {
    await env.RUN_GMC_GENERIC_CACHE_KV.delete(LETTERBOXD_EXPORT_KV_KEY);
    await env.RUN_GMC_GENERIC_CACHE_KV.delete(LETTERBOXD_REJECTED_COOKIE_KV_KEY);
  });

  it("downloads the export with the session cookie and caches it", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => zipResponse());

    expect(bytes(await getLetterboxdExport(testEnv, fetcher, NOW))).toEqual(NEW_ZIP);

    const request = new Request(...fetcher.mock.calls[0]);
    expect(request.url).toBe("https://letterboxd.com/data/export/");
    expect(request.headers.get("cookie")).toBe("letterboxd.user=session-cookie");
    expect(
      bytes(await env.RUN_GMC_GENERIC_CACHE_KV.get(LETTERBOXD_EXPORT_KV_KEY, "arrayBuffer")),
    ).toEqual(NEW_ZIP);
  });

  it("serves a download from the last day without fetching", async () => {
    await cacheZip(OLD_ZIP, NOW - ONE_DAY_MS + 1);
    const fetcher = vi.fn<typeof fetch>(async () => zipResponse());

    expect(bytes(await getLetterboxdExport(testEnv, fetcher, NOW))).toEqual(OLD_ZIP);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("downloads again once the cached export is a day old", async () => {
    await cacheZip(OLD_ZIP, NOW - ONE_DAY_MS);

    expect(bytes(await getLetterboxdExport(testEnv, async () => zipResponse(), NOW))).toEqual(
      NEW_ZIP,
    );
  });

  it("serves the stale export on a transient failure and retries on the next request", async () => {
    await cacheZip(OLD_ZIP, NOW - ONE_DAY_MS);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(zipResponse());

    expect(bytes(await getLetterboxdExport(testEnv, fetcher, NOW))).toEqual(OLD_ZIP);
    expect(bytes(await getLetterboxdExport(testEnv, fetcher, NOW + 1))).toEqual(NEW_ZIP);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serves the stale export when logged out and stops retrying with that cookie", async () => {
    await cacheZip(OLD_ZIP, NOW - ONE_DAY_MS);
    const fetcher = vi.fn<typeof fetch>(async () => signedOutResponse());

    expect(bytes(await getLetterboxdExport(testEnv, fetcher, NOW))).toEqual(OLD_ZIP);
    expect(bytes(await getLetterboxdExport(testEnv, fetcher, NOW + 1))).toEqual(OLD_ZIP);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries at once when the cookie secret changes after a rejection", async () => {
    await cacheZip(OLD_ZIP, NOW - ONE_DAY_MS);
    await getLetterboxdExport(testEnv, async () => signedOutResponse(), NOW);

    const newCookieEnv = { ...testEnv, LETTERBOXD_COOKIE: "new-session-cookie" };
    expect(bytes(await getLetterboxdExport(newCookieEnv, async () => zipResponse(), NOW))).toEqual(
      NEW_ZIP,
    );
  });

  it("returns null when the download fails and nothing is cached", async () => {
    expect(await getLetterboxdExport(testEnv, async () => signedOutResponse(), NOW)).toBeNull();
  });
});
