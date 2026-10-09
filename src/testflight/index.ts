import { idempotentSendEmail } from "@email";
import { USERAGENT, decodeHtmlEntities } from "@rss/common";

const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";
// Keep the daily idempotency keys a bit longer than one UTC day, then let KV drop them.
const DAILY_IDEMPOTENCY_TTL_SECONDS = 2 * 24 * 60 * 60;
// The join page shows one of these texts while nobody can join the beta. Any page
// without them counts as open. Apostrophes are compared in their straight form.
const BETA_CLOSED_TEXTS = [
  // No free tester slots.
  "This beta is full.",
  // The developer stopped new joins.
  "This beta isn't accepting any new testers right now.",
] as const;

// Public TestFlight link ids, from `https://testflight.apple.com/join/<id>`.
export const TESTFLIGHT_BETA_IDS = [
  // tldraw notes
  "ewR5xmUu",
] as const;

export type TestflightBetaStatus = {
  closed: boolean;
  title: string;
};

export function getTestflightJoinUrl(id: string): string {
  return `https://testflight.apple.com/join/${id}`;
}

export function parseTestflightBetaPage(html: string): TestflightBetaStatus {
  const title = decodeHtmlEntities(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "")
    .replace(/\s*-\s*TestFlight\s*-\s*Apple\s*$/, "")
    .trim();
  // Decode entities and straighten curly apostrophes so `isn&rsquo;t`, `isn&#8217;t`
  // and `isn’t` match. `decodeHtmlEntities` does not know `&rsquo;`.
  const text = decodeHtmlEntities(html.replaceAll(/&rsquo;/gi, "'")).replaceAll("\u2019", "'");
  return { closed: BETA_CLOSED_TEXTS.some((closedText) => text.includes(closedText)), title };
}

export function buildTestflightBetaEmail(url: string, title: string) {
  const name = title || url;
  return {
    body: `<p><a href="${url}">${name}</a> no longer says that the beta is full or closed to new testers.</p>`,
    subject: `[TestFlight] ${name} may have open slots`,
  };
}

export async function checkTestflightBeta(env: Env, id: string) {
  const url = getTestflightJoinUrl(id);
  // Ask for English so the closed texts match.
  const response = await fetch(url, {
    headers: { "accept-language": "en-US,en;q=0.9", "user-agent": USERAGENT },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`TestFlight page ${url} returned ${response.status}`);
  }
  const { closed, title } = parseTestflightBetaPage(await response.text());

  const today = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `testflight-${id}-${today}`;

  if (closed) {
    // Clear today's key so a beta that opens again later the same day emails again.
    // Read first so the every-5-minute check only spends a KV write after an email.
    if ((await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.get(idempotencyKey)) !== null) {
      await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.delete(idempotencyKey);
    }
    return { closed, emailed: false, title, url };
  }

  const emailed = await idempotentSendEmail(env, {
    ...buildTestflightBetaEmail(url, title),
    expirationTtl: DAILY_IDEMPOTENCY_TTL_SECONDS,
    idempotencyKey,
    to: NOTIFICATION_EMAIL,
  });
  return { closed, emailed, title, url };
}
