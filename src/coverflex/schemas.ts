import * as v from "valibot";

export const CoverflexAuthResponseSchema = v.object({
  token: v.string(),
  refresh_token: v.string(),
});

const CoverflexFileSchema = v.object({
  slug: v.string(),
  name: v.string(),
  url: v.string(),
});

const CoverflexProductSchema = v.object({
  slug: v.string(),
  files: v.array(CoverflexFileSchema),
});

export const CoverflexTechnologyResponseSchema = v.object({
  benefit: v.object({
    slug: v.string(),
    products: v.array(CoverflexProductSchema),
  }),
});

export const CoverflexPocketsResponseSchema = v.object({
  pockets: v.array(
    v.object({
      type: v.string(),
      balance: v.object({
        amount: v.number(),
      }),
    }),
  ),
});

export type CoverflexAuthResponse = v.InferOutput<typeof CoverflexAuthResponseSchema>;
