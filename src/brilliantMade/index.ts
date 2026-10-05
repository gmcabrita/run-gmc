import { idempotentSendEmail } from "@email";
import { USERAGENT } from "@rss/common";

const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";
// Keep the daily idempotency keys a bit longer than one UTC day, then let KV drop them.
const DAILY_IDEMPOTENCY_TTL_SECONDS = 2 * 24 * 60 * 60;

// Brilliant Made redemption pages. While a store is closed, the page answers
// with a 302 to `<url>/sorry`. Any other response can mean the store is open.
export const BRILLIANT_MADE_STORES = [
  { name: "claudeCodePlushies", url: "https://app.brilliantmade.com/r/claude-code-plushies" },
  { name: "claudeCodeStickers", url: "https://app.brilliantmade.com/r/claude-code-stickers" },
] as const;

export type BrilliantMadeStore = (typeof BRILLIANT_MADE_STORES)[number];

export function isBrilliantMadeStoreClosed(status: number, location: string | null): boolean {
  return status === 302 && location !== null && location.includes("/sorry");
}

export function buildBrilliantMadeEmail(url: string, status: number, location: string | null) {
  const locationLine = location === null ? "" : `<p>Location: ${location}</p>`;
  return {
    body: `<p><a href="${url}">${url}</a> returned HTTP ${status}.</p>${locationLine}`,
    subject: `[Brilliant Made] ${url} may be open (HTTP ${status})`,
  };
}

export async function checkBrilliantMadeStore(env: Env, { name, url }: BrilliantMadeStore) {
  // Read the redirect itself so the `/sorry` location stays visible.
  const response = await fetch(url, {
    headers: { "user-agent": USERAGENT },
    redirect: "manual",
  });
  const location = response.headers.get("location");
  await response.body?.cancel();

  const today = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `brilliant-made-${name}-${today}`;

  if (isBrilliantMadeStoreClosed(response.status, location)) {
    // Clear today's key so a reopening later the same day emails again.
    // Read first so the every-5-minute check only spends a KV write after an email.
    if ((await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.get(idempotencyKey)) !== null) {
      await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.delete(idempotencyKey);
    }
    return { emailed: false, location, status: response.status, url };
  }

  const emailed = await idempotentSendEmail(env, {
    ...buildBrilliantMadeEmail(url, response.status, location),
    expirationTtl: DAILY_IDEMPOTENCY_TTL_SECONDS,
    idempotencyKey,
    to: NOTIFICATION_EMAIL,
  });
  return { emailed, location, status: response.status, url };
}
