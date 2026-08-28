import { array, number, object, string, type InferOutput } from "valibot";

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
