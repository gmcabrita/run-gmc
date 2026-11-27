import type { Hono } from "hono";
import { captureException } from "@sentry/cloudflare";
import { USERAGENT } from "@rss/common";
import { createProxiedFetch } from "../proxiedFetch";

const LETTERBOXD_EXPORT_URL = "https://letterboxd.com/data/export/";
const LETTERBOXD_REQUEST_TIMEOUT_MS = 30_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_SECONDS = ONE_DAY_MS / 1000;

type LetterboxdExportMetadata = { downloadedAt: number };

export type LetterboxdAccount = {
  // Value of the account's `letterboxd.user` session cookie.
  getCookie: (env: Env) => string;
  username: string;
};

export const LETTERBOXD_ACCOUNTS: ReadonlyArray<LetterboxdAccount> = [
  { getCookie: (env) => env.LETTERBOXD_GMCABRITA_COOKIE, username: "gmcabrita" },
  { getCookie: (env) => env.LETTERBOXD_RAFAIDER_COOKIE, username: "rafaider" },
];

export function getLetterboxdExportKvKey(account: LetterboxdAccount): string {
  return `letterboxd:${account.username}:export`;
}

// Holds a hash of the cookie Letterboxd last rejected. Changing the secret
// retries at once; otherwise the next attempt waits until the key expires.
export function getLetterboxdRejectedCookieKvKey(account: LetterboxdAccount): string {
  return `letterboxd:${account.username}:rejected-cookie`;
}

export class LetterboxdAuthError extends Error {
  override name = "LetterboxdAuthError";
}

// Letterboxd answers an invalid session cookie with a 200 HTML page instead of
// the zip, so the content type is the auth signal.
async function downloadLetterboxdExport(
  username: string,
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
      `Letterboxd export for ${username} rejected the session cookie (${response.status}, ${contentType})`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Letterboxd export for ${username} failed with ${response.status} ${response.statusText}`,
    );
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
  account: LetterboxdAccount,
  fetcher: typeof fetch = createProxiedFetch(env),
  now: number = Date.now(),
): Promise<ArrayBuffer | null> {
  const kv = env.RUN_GMC_GENERIC_CACHE_KV;
  const exportKey = getLetterboxdExportKvKey(account);
  const rejectedCookieKey = getLetterboxdRejectedCookieKvKey(account);
  const cookie = account.getCookie(env);
  const cached = await kv.getWithMetadata<LetterboxdExportMetadata>(exportKey, "arrayBuffer");
  if (cached.value !== null && cached.metadata && now - cached.metadata.downloadedAt < ONE_DAY_MS) {
    return cached.value;
  }

  const cookieHash = await sha256Hex(cookie);
  if ((await kv.get(rejectedCookieKey)) === cookieHash) {
    return cached.value;
  }

  try {
    const zip = await downloadLetterboxdExport(account.username, cookie, fetcher);
    await kv.put(exportKey, zip, {
      metadata: { downloadedAt: now } satisfies LetterboxdExportMetadata,
    });
    return zip;
  } catch (error) {
    captureException(error);
    if (error instanceof LetterboxdAuthError) {
      await kv.put(rejectedCookieKey, cookieHash, {
        expirationTtl: ONE_DAY_SECONDS,
      });
    }
    return cached.value;
  }
}

export function addLetterboxdEndpoints(app: Hono<{ Bindings: Env }>): void {
  for (const account of LETTERBOXD_ACCOUNTS) {
    app.get(`/letterboxd.${account.username}.zip`, async (ctx) => {
      const zip = await getLetterboxdExport(ctx.env, account);
      if (zip === null) {
        return ctx.text(`Letterboxd export for ${account.username} is not available yet`, 503);
      }

      return ctx.body(zip, 200, {
        "Content-Disposition": `attachment; filename="letterboxd-${account.username}.zip"`,
        "Content-Type": "application/zip",
      });
    });
  }
}
