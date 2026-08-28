import {
  array,
  boolean,
  looseObject,
  nullish,
  optional,
  string,
  unknown,
  type InferOutput,
} from "valibot";

const XUserLegacySchema = looseObject({
  description: nullish(string()),
  name: string(),
  profile_image_url_https: nullish(string()),
  protected: nullish(boolean()),
  screen_name: string(),
});

const XUserResultSchema = looseObject({
  legacy: XUserLegacySchema,
  rest_id: string(),
});

export const XUserByScreenNameResponseSchema = looseObject({
  data: looseObject({
    user: looseObject({
      result: XUserResultSchema,
    }),
  }),
});

const XPostLegacySchema = looseObject({
  created_at: string(),
  full_text: string(),
  id_str: string(),
});

const XPostCoreSchema = looseObject({
  user_results: looseObject({
    result: looseObject({
      legacy: XUserLegacySchema,
    }),
  }),
});

const XPostSchema = looseObject({
  core: nullish(XPostCoreSchema),
  legacy: nullish(XPostLegacySchema),
});

const XTweetResultSchema = looseObject({
  result: nullish(XPostSchema),
});

const XItemContentSchema = looseObject({
  promotedMetadata: optional(unknown()),
  tweet_results: nullish(XTweetResultSchema),
});

const XTimelineEntrySchema = looseObject({
  content: nullish(
    looseObject({
      itemContent: nullish(XItemContentSchema),
      items: nullish(
        array(
          looseObject({
            item: nullish(
              looseObject({
                itemContent: nullish(XItemContentSchema),
              }),
            ),
          }),
        ),
      ),
    }),
  ),
});

export const XUserTweetsResponseSchema = looseObject({
  data: looseObject({
    user: looseObject({
      result: looseObject({
        timeline_v2: nullish(
          looseObject({
            timeline: looseObject({
              instructions: array(
                looseObject({
                  entries: nullish(array(XTimelineEntrySchema)),
                }),
              ),
            }),
          }),
        ),
      }),
    }),
  }),
});

export const XOEmbedResponseSchema = looseObject({
  html: string(),
});

export type XPost = InferOutput<typeof XPostSchema>;
export type XUserByScreenNameResponse = InferOutput<
  typeof XUserByScreenNameResponseSchema
>;
export type XUserTweetsResponse = InferOutput<typeof XUserTweetsResponseSchema>;
