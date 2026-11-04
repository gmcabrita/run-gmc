import {
  array,
  literal,
  looseObject,
  nullish,
  number,
  object,
  record,
  string,
  unknown,
  variant,
  type InferOutput,
} from "valibot";

export const CoverflexAuthResponseSchema = object({
  refresh_token: string(),
  token: string(),
});

const CoverflexFileSchema = object({
  name: string(),
  slug: string(),
  url: string(),
});

const CoverflexProductSchema = object({
  files: array(CoverflexFileSchema),
  slug: string(),
});

export const CoverflexTechnologyResponseSchema = object({
  benefit: object({
    products: array(CoverflexProductSchema),
    slug: string(),
  }),
});

export const CoverflexPocketsResponseSchema = object({
  pockets: array(
    object({
      balance: object({
        amount: number(),
      }),
      type: string(),
    }),
  ),
});

export type CoverflexAuthResponse = InferOutput<typeof CoverflexAuthResponseSchema>;

const CoverflexDiscountFieldsSchema = {
  category: string(),
  conditions_links: nullish(looseObject({ pt_pt: nullish(string()) })),
  id: string(),
  logo_url: nullish(string()),
  // Also the key of the discount texts in the translations file.
  partner_name: string(),
  promo_code: nullish(string()),
};

const CoverflexDiscountSchema = variant("type", [
  // `value` is the percentage as text, for example "25".
  looseObject({ ...CoverflexDiscountFieldsSchema, type: literal("percentage"), value: string() }),
  // `amount` is in cents, for example 25000 for 250 EUR.
  looseObject({
    ...CoverflexDiscountFieldsSchema,
    type: literal("amount"),
    value: object({ amount: number(), currency: string() }),
  }),
]);

export const CoverflexDiscountsResponseSchema = object({
  discounts: object({
    list: array(CoverflexDiscountSchema),
  }),
});

// Flat map of translation keys, for example `wallet.discounts.<partner_name>.title`.
// Most values are strings, but some are arrays or objects.
export const CoverflexTranslationsSchema = record(string(), unknown());

export type CoverflexDiscount = InferOutput<typeof CoverflexDiscountSchema>;
export type CoverflexTranslations = InferOutput<typeof CoverflexTranslationsSchema>;
