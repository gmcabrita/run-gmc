import {
  array,
  boolean,
  looseObject,
  nullish,
  number,
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

const XListMembersEntrySchema = looseObject({
  content: looseObject({
    cursorType: nullish(string()),
    itemContent: nullish(
      looseObject({
        user_results: nullish(
          looseObject({
            // `UserUnavailable` results have no `rest_id`.
            result: nullish(looseObject({ rest_id: nullish(string()) })),
          }),
        ),
      }),
    ),
    value: nullish(string()),
  }),
  entryId: string(),
});

export const XListMembersResponseSchema = looseObject({
  data: looseObject({
    list: looseObject({
      members_timeline: looseObject({
        timeline: looseObject({
          instructions: array(
            looseObject({
              entries: nullish(array(XListMembersEntrySchema)),
            }),
          ),
        }),
      }),
    }),
  }),
});

// https://nobots.fyi/suspects.json: `h` is the screen name, `s` is the bot score (0 to 100).
export const NobotsSuspectsResponseSchema = array(
  looseObject({
    h: string(),
    s: number(),
  }),
);

export const XOEmbedResponseSchema = looseObject({
  html: string(),
});

export type NobotsSuspectsResponse = InferOutput<typeof NobotsSuspectsResponseSchema>;
export type XListMembersResponse = InferOutput<typeof XListMembersResponseSchema>;
export type XPost = InferOutput<typeof XPostSchema>;
export type XUserByScreenNameResponse = InferOutput<typeof XUserByScreenNameResponseSchema>;
export type XUserTweetsResponse = InferOutput<typeof XUserTweetsResponseSchema>;
