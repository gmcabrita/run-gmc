import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRILLIANT_MADE_STORES,
  checkBrilliantMadeStore,
  isBrilliantMadeStoreClosed,
} from "./index";

const [PLUSHIES, STICKERS] = BRILLIANT_MADE_STORES;
const PLUSHIES_URL = PLUSHIES.url;
const STICKERS_URL = STICKERS.url;

function mockFetch(responses: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const respond = responses[String(input)];
    if (!respond) {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }
    return respond();
  });
}

function sorryRedirect(url: string) {
  return new Response(null, { headers: { location: `${url}/sorry` }, status: 302 });
}

describe("brilliantMade", () => {
  beforeEach(async () => {
    const { keys } = await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.list({ prefix: "brilliant-made-" });
    await Promise.all(keys.map(({ name }) => env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.delete(name)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats only a 302 to /sorry as closed", () => {
    expect(isBrilliantMadeStoreClosed(302, `${PLUSHIES_URL}/sorry`)).toBe(true);
    expect(isBrilliantMadeStoreClosed(302, `${PLUSHIES_URL}/shop`)).toBe(false);
    expect(isBrilliantMadeStoreClosed(302, null)).toBe(false);
    expect(isBrilliantMadeStoreClosed(301, `${PLUSHIES_URL}/sorry`)).toBe(false);
    expect(isBrilliantMadeStoreClosed(200, null)).toBe(false);
  });

  it("does not email while the store redirects to /sorry", async () => {
    mockFetch({ [PLUSHIES_URL]: () => sorryRedirect(PLUSHIES_URL) });

    const result = await checkBrilliantMadeStore(env, PLUSHIES);

    expect(result).toMatchObject({ emailed: false, status: 302 });
  });

  it("emails at most once per day for each store", async () => {
    mockFetch({
      [PLUSHIES_URL]: () => new Response("open", { status: 200 }),
      [STICKERS_URL]: () => new Response("open", { status: 200 }),
    });

    expect((await checkBrilliantMadeStore(env, PLUSHIES)).emailed).toBe(true);
    expect((await checkBrilliantMadeStore(env, PLUSHIES)).emailed).toBe(false);
    // The other store has its own idempotency key.
    expect((await checkBrilliantMadeStore(env, STICKERS)).emailed).toBe(true);
  });

  it("does not follow the redirect", async () => {
    const fetchSpy = mockFetch({ [STICKERS_URL]: () => sorryRedirect(STICKERS_URL) });

    await checkBrilliantMadeStore(env, STICKERS);

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
});
