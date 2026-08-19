import * as v from "valibot";

const XUserLegacySchema = v.looseObject({
  screen_name: v.string(),
  name: v.string(),
  description: v.nullish(v.string()),
  profile_image_url_https: v.nullish(v.string()),
  protected: v.nullish(v.boolean()),
});

const XUserResultSchema = v.looseObject({
  rest_id: v.string(),
  legacy: XUserLegacySchema,
});

export const XUserByScreenNameResponseSchema = v.looseObject({
  data: v.looseObject({
    user: v.looseObject({
      result: XUserResultSchema,
    }),
  }),
});

const XPostLegacySchema = v.looseObject({
  id_str: v.string(),
  full_text: v.string(),
  created_at: v.string(),
});

const XPostCoreSchema = v.looseObject({
  user_results: v.looseObject({
    result: v.looseObject({
      legacy: XUserLegacySchema,
    }),
  }),
});

const XPostSchema = v.looseObject({
  legacy: v.nullish(XPostLegacySchema),
  core: v.nullish(XPostCoreSchema),
});

const XTweetResultSchema = v.looseObject({
  result: v.nullish(XPostSchema),
});

const XItemContentSchema = v.looseObject({
  tweet_results: v.nullish(XTweetResultSchema),
  promotedMetadata: v.optional(v.unknown()),
});

const XTimelineEntrySchema = v.looseObject({
  content: v.nullish(
    v.looseObject({
      itemContent: v.nullish(XItemContentSchema),
      items: v.nullish(
        v.array(
          v.looseObject({
            item: v.nullish(
              v.looseObject({
                itemContent: v.nullish(XItemContentSchema),
              }),
            ),
          }),
        ),
      ),
    }),
  ),
});

export const XUserTweetsResponseSchema = v.looseObject({
  data: v.looseObject({
    user: v.looseObject({
      result: v.looseObject({
        timeline_v2: v.nullish(
          v.looseObject({
            timeline: v.looseObject({
              instructions: v.array(
                v.looseObject({
                  entries: v.nullish(v.array(XTimelineEntrySchema)),
                }),
              ),
            }),
          }),
        ),
      }),
    }),
  }),
});

export const XOEmbedResponseSchema = v.looseObject({
  html: v.string(),
});

export type XPost = v.InferOutput<typeof XPostSchema>;
export type XUserByScreenNameResponse = v.InferOutput<
  typeof XUserByScreenNameResponseSchema
>;
export type XUserTweetsResponse = v.InferOutput<typeof XUserTweetsResponseSchema>;
