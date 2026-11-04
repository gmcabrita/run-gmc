import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "valibot";
import discountsFixture from "./__fixtures__/discounts.json";
import translationsFixture from "./__fixtures__/translations.json";
import {
  COVERFLEX_DISCOUNTS_URL,
  COVERFLEX_DISCOUNT_IDS_KV_KEY,
  COVERFLEX_TRANSLATIONS_URL,
  buildCoverflexDiscountsEmail,
  findNewCoverflexDiscounts,
  formatCoverflexDiscountValue,
  sendNewCoverflexDiscountsByEmail,
} from "./discounts";
import { CoverflexDiscountsResponseSchema, CoverflexTranslationsSchema } from "./schemas";

const discounts = parse(CoverflexDiscountsResponseSchema, discountsFixture).discounts.list;
const translations = parse(CoverflexTranslationsSchema, translationsFixture);
const [digIn, credilink, fitnessUp] = discounts;

function discountsResponse(list: ReadonlyArray<unknown>) {
  return Response.json({ discounts: { ...discountsFixture.discounts, list } });
}

function mockFetch(list: ReadonlyArray<unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    switch (String(input)) {
      case COVERFLEX_DISCOUNTS_URL:
        return discountsResponse(list);
      case COVERFLEX_TRANSLATIONS_URL:
        return Response.json(translationsFixture);
      default:
        throw new Error(`Unexpected fetch: ${String(input)}`);
    }
  });
}

describe("coverflex discounts", () => {
  beforeEach(async () => {
    // A cached token skips the Coverflex login request.
    await env.RUN_GMC_GENERIC_CACHE_KV.put("coverflex:token", "test-token");
    await env.RUN_GMC_GENERIC_CACHE_KV.delete(COVERFLEX_DISCOUNT_IDS_KV_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns every discount when there is no previous list", () => {
    expect(findNewCoverflexDiscounts(null, discounts)).toEqual(discounts);
  });

  it("returns only discounts with ids that are not in the previous list", () => {
    expect(findNewCoverflexDiscounts([digIn.id, "removed-id"], discounts)).toEqual([
      credilink,
      fitnessUp,
    ]);
  });

  it("formats percentage and amount discounts", () => {
    expect(formatCoverflexDiscountValue(digIn)).toBe("25%");
    expect(formatCoverflexDiscountValue(credilink)).toBe("250,00\u00A0€");
  });

  it("renders translated texts and falls back to the partner name", () => {
    const { body, subject } = buildCoverflexDiscountsEmail([digIn, fitnessUp], translations, false);

    expect(subject).toBe("[Coverflex] 2 new discounts");
    expect(body).toContain("<h2>DIG-IN</h2>");
    expect(body).toContain("25% de desconto em todos os planos DIG-IN PRO");
    expect(body).toContain("<code>COVERFLEX</code>");
    expect(body).toContain("<h2>Fitness_Up</h2>");
  });

  it("emails everything on the first run, then only new discounts", async () => {
    const fetchSpy = mockFetch([discountsFixture.discounts.list[0]]);
    const sendSpy = vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "1" });

    expect(await sendNewCoverflexDiscountsByEmail(env)).toEqual({
      emailed: true,
      newDiscounts: [{ id: digIn.id, partner_name: "111_dig_in" }],
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]?.[0]).toMatchObject({
      subject: "[Coverflex] 1 discounts (first run)",
    });

    // Same list: no email and no translations request.
    fetchSpy.mockClear();
    expect((await sendNewCoverflexDiscountsByEmail(env)).emailed).toBe(false);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([COVERFLEX_DISCOUNTS_URL]);

    // A discount was added: email only that one.
    fetchSpy.mockRestore();
    mockFetch(discountsFixture.discounts.list.slice(0, 2));
    expect(await sendNewCoverflexDiscountsByEmail(env)).toEqual({
      emailed: true,
      newDiscounts: [{ id: credilink.id, partner_name: "Credilink" }],
    });
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy.mock.calls[1]?.[0]).toMatchObject({ subject: "[Coverflex] 1 new discount" });
  });

  it("does not email when a discount is removed", async () => {
    const fetchSpy = mockFetch(discountsFixture.discounts.list);
    const sendSpy = vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "1" });
    await sendNewCoverflexDiscountsByEmail(env);

    fetchSpy.mockRestore();
    mockFetch(discountsFixture.discounts.list.slice(1));

    expect((await sendNewCoverflexDiscountsByEmail(env)).emailed).toBe(false);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the stored list when Coverflex returns no discounts", async () => {
    await env.RUN_GMC_GENERIC_CACHE_KV.put(COVERFLEX_DISCOUNT_IDS_KV_KEY, JSON.stringify(["a"]));
    mockFetch([]);

    await expect(sendNewCoverflexDiscountsByEmail(env)).rejects.toThrow("empty list");
    expect(await env.RUN_GMC_GENERIC_CACHE_KV.get(COVERFLEX_DISCOUNT_IDS_KV_KEY)).toBe('["a"]');
  });
});
