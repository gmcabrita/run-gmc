import { array, is, parse, string } from "valibot";
import { sendEmail } from "@email";
import { escapeHtml } from "../rss/scrapers";
import { getAuthenticationToken } from "./util";
import {
  CoverflexDiscountsResponseSchema,
  CoverflexTranslationsSchema,
  type CoverflexDiscount,
  type CoverflexTranslations,
} from "./schemas";

export const COVERFLEX_DISCOUNTS_URL =
  "https://menhir-api.coverflex.com/api/employee/discounts?pagination=no";
export const COVERFLEX_TRANSLATIONS_URL =
  "https://static.coverflex.com/translations/frontend-platform/apps/employee-app/common/translations/pt_PT/translation.json";
// JSON array with the discount ids of the last run. No TTL, so a missed day
// still compares against the last known list.
export const COVERFLEX_DISCOUNT_IDS_KV_KEY = "coverflex:discount_ids";
const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";

// Returns all discounts when there is no previous list, so the first run sends
// everything.
export function findNewCoverflexDiscounts(
  previousIds: ReadonlyArray<string> | null,
  discounts: ReadonlyArray<CoverflexDiscount>,
): Array<CoverflexDiscount> {
  if (previousIds === null) {
    return [...discounts];
  }
  const known = new Set(previousIds);
  return discounts.filter((discount) => !known.has(discount.id));
}

export function formatCoverflexDiscountValue(discount: CoverflexDiscount): string {
  if (discount.type === "percentage") {
    return `${discount.value}%`;
  }
  return new Intl.NumberFormat("pt-PT", {
    currency: discount.value.currency,
    style: "currency",
  }).format(discount.value.amount / 100);
}

function getTranslation(
  translations: CoverflexTranslations,
  discount: CoverflexDiscount,
  field: "description_long" | "description_short" | "name" | "title",
): string | undefined {
  const value = translations[`wallet.discounts.${discount.partner_name}.${field}`];
  return is(string(), value) && value.trim() !== "" ? value : undefined;
}

function textToHtml(text: string): string {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

function renderCoverflexDiscount(
  discount: CoverflexDiscount,
  translations: CoverflexTranslations,
): string {
  // Some partners have no texts in the translations file.
  const name = getTranslation(translations, discount, "name") ?? discount.partner_name;
  const title = getTranslation(translations, discount, "title");
  const shortDescription = getTranslation(translations, discount, "description_short");
  const longDescription = getTranslation(translations, discount, "description_long");
  const link = discount.conditions_links?.pt_pt;

  const details = [
    `<li>Desconto: ${escapeHtml(formatCoverflexDiscountValue(discount))}</li>`,
    `<li>Categoria: ${escapeHtml(discount.category)}</li>`,
    discount.promo_code ? `<li>Código: <code>${escapeHtml(discount.promo_code)}</code></li>` : "",
    link ? `<li><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></li>` : "",
  ].join("");

  return [
    `<h2>${escapeHtml(name)}</h2>`,
    title ? `<p><strong>${textToHtml(title)}</strong></p>` : "",
    shortDescription ? `<p><em>${textToHtml(shortDescription)}</em></p>` : "",
    longDescription ? `<p>${textToHtml(longDescription)}</p>` : "",
    `<ul>${details}</ul>`,
  ].join("\n");
}

export function buildCoverflexDiscountsEmail(
  discounts: ReadonlyArray<CoverflexDiscount>,
  translations: CoverflexTranslations,
  firstRun: boolean,
) {
  const subject = firstRun
    ? `[Coverflex] ${discounts.length} discounts (first run)`
    : `[Coverflex] ${discounts.length} new discount${discounts.length === 1 ? "" : "s"}`;
  const body = discounts
    .map((discount) => renderCoverflexDiscount(discount, translations))
    .join("\n<hr>\n");
  return { body, subject };
}

async function fetchCoverflexDiscounts(env: Env): Promise<Array<CoverflexDiscount>> {
  const response = await fetch(COVERFLEX_DISCOUNTS_URL, {
    headers: {
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${await getAuthenticationToken(env)}`,
      origin: "https://my.coverflex.com",
      referer: "https://my.coverflex.com/",
      "x-coverflex-channel": "web",
      "x-coverflex-language": "pt-PT",
      "x-coverflex-version": "1.869.0",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Coverflex discounts returned ${response.status}`);
  }
  const { list } = parse(CoverflexDiscountsResponseSchema, await response.json()).discounts;
  // An empty list would replace the stored ids and make the next run send every
  // discount again.
  if (list.length === 0) {
    throw new Error("Coverflex discounts returned an empty list");
  }
  return list;
}

async function fetchCoverflexTranslations(): Promise<CoverflexTranslations> {
  const response = await fetch(COVERFLEX_TRANSLATIONS_URL, {
    headers: {
      accept: "*/*",
      origin: "https://my.coverflex.com",
      referer: "https://my.coverflex.com/",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Coverflex translations returned ${response.status}`);
  }
  return parse(CoverflexTranslationsSchema, await response.json());
}

async function getPreviousCoverflexDiscountIds(env: Env): Promise<Array<string> | null> {
  const stored = await env.RUN_GMC_GENERIC_CACHE_KV.get(COVERFLEX_DISCOUNT_IDS_KV_KEY);
  return stored === null ? null : parse(array(string()), JSON.parse(stored));
}

export async function sendNewCoverflexDiscountsByEmail(env: Env) {
  const discounts = await fetchCoverflexDiscounts(env);
  const previousIds = await getPreviousCoverflexDiscountIds(env);
  const newDiscounts = findNewCoverflexDiscounts(previousIds, discounts);

  if (newDiscounts.length > 0) {
    const translations = await fetchCoverflexTranslations();
    await sendEmail(env, {
      ...buildCoverflexDiscountsEmail(newDiscounts, translations, previousIds === null),
      to: NOTIFICATION_EMAIL,
    });
  }

  // Store the list after the email, so a failed email is retried on the next run.
  await env.RUN_GMC_GENERIC_CACHE_KV.put(
    COVERFLEX_DISCOUNT_IDS_KV_KEY,
    JSON.stringify(discounts.map((discount) => discount.id)),
  );

  return {
    emailed: newDiscounts.length > 0,
    newDiscounts: newDiscounts.map(({ id, partner_name }) => ({ id, partner_name })),
  };
}
