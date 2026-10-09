import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fullHtml from "./__fixtures__/tldraw-notes-full.html";
import { checkTestflightBeta, getTestflightJoinUrl, parseTestflightBetaPage } from "./index";

const ID = "ewR5xmUu";
const OTHER_ID = "abcd1234";
const FULL_TEXT = "This beta is full.";
const openHtml = fullHtml.replace(FULL_TEXT, "Testing Apps with TestFlight");

function mockFetch(responses: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const respond = responses[String(input)];
    if (!respond) {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }
    return respond();
  });
}

describe("testflight", () => {
  beforeEach(async () => {
    const { keys } = await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.list({ prefix: "testflight-" });
    await Promise.all(keys.map(({ name }) => env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.delete(name)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a full beta page", () => {
    expect(parseTestflightBetaPage(fullHtml)).toEqual({
      closed: true,
      title: "Join the tldraw notes beta",
    });
  });

  it("treats a beta that is not accepting new testers as closed", () => {
    for (const notAccepting of [
      "This beta isn't accepting any new testers right now.",
      "This beta isn\u2019t accepting any new testers right now.",
      "This beta isn&rsquo;t accepting any new testers right now.",
      "This beta isn&#8217;t accepting any new testers right now.",
      "This beta isn&#39;t accepting any new testers right now.",
    ]) {
      expect(parseTestflightBetaPage(fullHtml.replace(FULL_TEXT, notAccepting)).closed).toBe(true);
    }
  });

  it("treats a page without a closed text as open", () => {
    expect(parseTestflightBetaPage(openHtml).closed).toBe(false);
  });

  it("does not email while the beta is full", async () => {
    mockFetch({ [getTestflightJoinUrl(ID)]: () => new Response(fullHtml) });

    expect(await checkTestflightBeta(env, ID)).toMatchObject({ closed: true, emailed: false });
  });

  it("emails at most once per day for each beta", async () => {
    mockFetch({
      [getTestflightJoinUrl(ID)]: () => new Response(openHtml),
      [getTestflightJoinUrl(OTHER_ID)]: () => new Response(openHtml),
    });

    expect((await checkTestflightBeta(env, ID)).emailed).toBe(true);
    expect((await checkTestflightBeta(env, ID)).emailed).toBe(false);
    // The other beta has its own idempotency key.
    expect((await checkTestflightBeta(env, OTHER_ID)).emailed).toBe(true);
  });

  it("emails again when the beta opens after being full", async () => {
    let html = openHtml;
    mockFetch({ [getTestflightJoinUrl(ID)]: () => new Response(html) });

    const idempotencyKey = `testflight-${ID}-${new Date().toISOString().slice(0, 10)}`;

    expect((await checkTestflightBeta(env, ID)).emailed).toBe(true);
    expect(await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.get(idempotencyKey)).not.toBeNull();
    html = fullHtml;
    expect((await checkTestflightBeta(env, ID)).emailed).toBe(false);
    expect(await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.get(idempotencyKey)).toBeNull();
    html = openHtml;
    expect((await checkTestflightBeta(env, ID)).emailed).toBe(true);
  });

  it("throws on an error response and does not email", async () => {
    mockFetch({ [getTestflightJoinUrl(ID)]: () => new Response("nope", { status: 503 }) });

    await expect(checkTestflightBeta(env, ID)).rejects.toThrow("returned 503");
  });
});
