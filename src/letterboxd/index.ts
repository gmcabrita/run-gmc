import type { Hono } from "hono";
import { captureException } from "@sentry/cloudflare";
import { USERAGENT } from "@rss/common";
import { createProxiedFetch } from "../proxiedFetch";

const LETTERBOXD_EXPORT_URL = "https://letterboxd.com/data/export/";
const LETTERBOXD_REQUEST_TIMEOUT_MS = 30_000;
export const LETTERBOXD_EXPORT_KV_KEY = "letterboxd:export";
// Holds a hash of the cookie Letterboxd last rejected. Changing the secret
// retries at once; otherwise the next attempt waits until the key expires.
export const LETTERBOXD_REJECTED_COOKIE_KV_KEY = "letterboxd:export:rejected-cookie";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_SECONDS = ONE_DAY_MS / 1000;

type LetterboxdExportMetadata = { downloadedAt: number };

export class LetterboxdAuthError extends Error {
  override name = "LetterboxdAuthError";
}

// Letterboxd answers an invalid session cookie with a 200 HTML page instead of
// the zip, so the content type is the auth signal.
async function downloadLetterboxdExport(
  cookie: string,
  fetcher: typeof fetch,
): Promise<ArrayBuffer> {
  const response = await fetcher(LETTERBOXD_EXPORT_URL, {
    headers: { cookie: `letterboxd.user=${cookie}`, "user-agent": USERAGENT },
    signal: AbortSignal.timeout(LETTERBOXD_REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (response.status === 401 || (response.ok && !contentType.startsWith("application/zip"))) {
    throw new LetterboxdAuthError(
      `Letterboxd export rejected the session cookie (${response.status}, ${contentType})`,
    );
  }
  if (!response.ok) {
    throw new Error(`Letterboxd export failed with ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Downloads at most once per day after a successful download. Failures are
// reported to Sentry and the last good export is served. Other failures retry
// on the next request; a rejected cookie is not retried for a day.
export async function getLetterboxdExport(
  env: Env,
  fetcher: typeof fetch = createProxiedFetch(env),
  now: number = Date.now(),
): Promise<ArrayBuffer | null> {
  const kv = env.RUN_GMC_GENERIC_CACHE_KV;
  const cached = await kv.getWithMetadata<LetterboxdExportMetadata>(
    LETTERBOXD_EXPORT_KV_KEY,
    "arrayBuffer",
  );
  if (cached.value !== null && cached.metadata && now - cached.metadata.downloadedAt < ONE_DAY_MS) {
    return cached.value;
  }

  const cookieHash = await sha256Hex(env.LETTERBOXD_COOKIE);
  if ((await kv.get(LETTERBOXD_REJECTED_COOKIE_KV_KEY)) === cookieHash) {
    return cached.value;
  }

  try {
    const zip = await downloadLetterboxdExport(env.LETTERBOXD_COOKIE, fetcher);
    await kv.put(LETTERBOXD_EXPORT_KV_KEY, zip, {
      metadata: { downloadedAt: now } satisfies LetterboxdExportMetadata,
    });
    return zip;
  } catch (error) {
    captureException(error);
    if (error instanceof LetterboxdAuthError) {
      await kv.put(LETTERBOXD_REJECTED_COOKIE_KV_KEY, cookieHash, {
        expirationTtl: ONE_DAY_SECONDS,
      });
    }
    return cached.value;
  }
}

export function addLetterboxdEndpoints(app: Hono<{ Bindings: Env }>): void {
  app.get("/letterboxd.zip", async (ctx) => {
    const zip = await getLetterboxdExport(ctx.env);
    if (zip === null) {
      return ctx.text("Letterboxd export is not available yet", 503);
    }

    return ctx.body(zip, 200, {
      "Content-Disposition": 'attachment; filename="letterboxd.zip"',
      "Content-Type": "application/zip",
    });
  });
}
