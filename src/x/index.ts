import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { Feed } from "feed";
import { stripInvalidXmlChars } from "@rss/common";
import type { FeedItem } from "@types";
import * as v from "valibot";
import {
  XOEmbedResponseSchema,
  XUserByScreenNameResponseSchema,
  XUserTweetsResponseSchema,
  type XPost,
  type XUserByScreenNameResponse,
  type XUserTweetsResponse,
} from "./schemas";
import { buildXApiHeaders, resolveCredentials, type XCredentials } from "./credentials";
import {
  createPrivateProfileNoticeFeed,
  getTimelineEntries,
  isProtectedProfile,
} from "./feed";

async function fetchUser(
  env: CloudflareBindings,
  credentials: XCredentials,
  userName: string,
): Promise<XUserByScreenNameResponse> {
  const response = await fetch(
    `https://x.com/i/api/graphql/QGIw94L0abhuohrr76cSbw/UserByScreenName?variables=%7B%22screen_name%22%3A%22${userName}%22%7D&features=%7B%22hidden_profile_subscriptions_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%2C%22subscriptions_verification_info_is_identity_verified_enabled%22%3Atrue%2C%22subscriptions_verification_info_verified_since_enabled%22%3Atrue%2C%22highlights_tweets_tab_ui_enabled%22%3Atrue%2C%22responsive_web_twitter_article_notes_tab_enabled%22%3Atrue%2C%22subscriptions_feature_can_gift_premium%22%3Atrue%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%7D&fieldToggles=%7B%22withAuxiliaryUserLabels%22%3Afalse%7D`,
    {
      headers: buildXApiHeaders(credentials, {
        "x-client-transaction-id":
          "udHa734ZeSBqnvzPqPG94NSh/3QuYCdvr9Yj/Z8PTCwCb19u+P//mW1AROJoG3Te/pJJsLqVjvexVwSq5cHAhLFUVOJAug",
      }),
      method: "GET",
    },
  );

  if (response.status == 429) throw new Error("Rate Limited");

  return v.parse(XUserByScreenNameResponseSchema, await response.json());
}

async function fetchPosts(
  env: CloudflareBindings,
  credentials: XCredentials,
  userId: string,
): Promise<XUserTweetsResponse> {
  const response = await fetch(
    `https://x.com/i/api/graphql/1mDAyxlBlMp6uokkzihecQ/UserTweets?variables=%7B%22userId%22%3A%22${userId}%22%2C%22count%22%3A50%2C%22includePromotedContent%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withV2Timeline%22%3Atrue%7D&features=%7B%22profile_label_improvements_pcf_label_in_post_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22creator_subscriptions_quote_tweet_preview_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22rweb_video_timestamps_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticlePlainText%22%3Afalse%7D`,
    {
      headers: buildXApiHeaders(credentials),
      method: "GET",
    },
  );

  if (response.status == 429) throw new Error("Rate Limited");
  return v.parse(XUserTweetsResponseSchema, await response.json());
}

async function transformPost(
  env: CloudflareBindings,
  post: XPost | undefined,
): Promise<FeedItem | undefined> {
  if (post?.legacy && post.core) {
    const postUrl = `https://x.com/${post.core.user_results.result.legacy.screen_name}/status/${post.legacy.id_str}`;

    return {
      title:
        post.legacy.full_text.substring(0, 50) + (post.legacy.full_text.length > 50 ? "..." : ""),
      id: post.legacy.id_str,
      link: postUrl,
      content: (await getEmbedWithRetries(env, postUrl, 2)) ?? "",
      author: [
        {
          name: post.core.user_results.result.legacy.name,
          link: `https://x.com/${post.core.user_results.result.legacy.screen_name}`,
        },
      ],
      date: new Date(post.legacy.created_at),
    };
  }
}

async function getEmbedWithRetries(
  env: CloudflareBindings,
  postUrl: string,
  retryCount: number,
): Promise<string | undefined> {
  var lastError;
  for (let i = 0; i < retryCount; i++) {
    try {
      return await getEmbed(env, postUrl);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
}

async function getEmbed(env: CloudflareBindings, postUrl: string): Promise<string> {
  const cachedHtml = await env.RUN_GMC_X_CACHE_KV.get(postUrl);

  if (cachedHtml) return cachedHtml;

  const response = await fetch(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(postUrl)}`,
  );
  const json = v.parse(XOEmbedResponseSchema, await response.json());

  await env.RUN_GMC_X_CACHE_KV.put(postUrl, json.html, { expirationTtl: 1209600 });

  return json.html;
}

async function x2Rss(env: CloudflareBindings, userName: string, data: XUserTweetsResponse) {
  const entries = getTimelineEntries(data);
  const firstUser =
    entries?.[0]?.content?.itemContent?.tweet_results?.result?.core?.user_results?.result?.legacy;

  const feed = new Feed({
    title: `X // ${firstUser?.name || userName}`,
    description: firstUser?.description || userName,
    id: `https://x.com/${firstUser?.screen_name || userName}`,
    link: `https://x.com/${firstUser?.screen_name || userName}`,
    language: "en",
    image: firstUser?.profile_image_url_https ?? undefined,
    favicon: "https://x.com/favicon.ico",
    copyright: `All rights reserved ${new Date().getFullYear()}, ${firstUser?.name}`,
    updated: new Date(),
    generator: "X2RSS",
    author: {
      name: firstUser?.name || "",
      link: `https://x.com/${firstUser?.screen_name}`,
    },
  });

  for (const entry of entries) {
    if (entry.content?.itemContent?.promotedMetadata) continue;

    const post = await transformPost(
      env,
      entry.content?.itemContent?.tweet_results?.result ?? undefined,
    );
    if (post) {
      feed.addItem(post);
    }

    if (entry.content?.items?.[0]?.item?.itemContent?.promotedMetadata) continue;
    const threadedPost = await transformPost(
      env,
      entry.content?.items?.[0]?.item?.itemContent?.tweet_results?.result ?? undefined,
    );
    if (threadedPost) {
      feed.addItem(threadedPost);
    }
  }

  return feed;
}

export function addXEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get(
    "/rss.x",
    async (ctx, next) => {
      const auth = basicAuth({
        username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
        password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      });
      return auth(ctx, next);
    },
    async (ctx) => {
      const userName = ctx.req.query("userName");
      const isPublic = ctx.req.query("public") === "true";

      if (!userName) {
        ctx.status(400);
        return ctx.text("no userName provided");
      }

      try {
        const cacheKey = `rss.x:${userName}${isPublic ? ":public" : ""}`;

        const { value: cachedRss, metadata } = await ctx.env.RUN_GMC_X_CACHE_KV.getWithMetadata<{
          expiresAt: number;
        }>(cacheKey);
        if (cachedRss && metadata) {
          const remainingTtl = Math.max(0, Math.floor((metadata.expiresAt - Date.now()) / 1000));
          ctx.header("Content-Type", "application/rss+xml");
          ctx.header("Cache-Control", `max-age=${remainingTtl + 1}`);
          return ctx.text(stripInvalidXmlChars(cachedRss));
        }

        const maxAge = Math.floor(Math.random() * (2400 - 1200 + 1)) + 1200;
        const credentials = resolveCredentials(ctx.env, isPublic);
        const user = await fetchUser(ctx.env, credentials, userName);
        const userId = user.data.user.result.rest_id;
        const feed =
          isPublic && isProtectedProfile(user)
            ? createPrivateProfileNoticeFeed(userName)
            : await x2Rss(ctx.env, userName, await fetchPosts(ctx.env, credentials, userId));
        const rss2 = stripInvalidXmlChars(feed.rss2());

        await ctx.env.RUN_GMC_X_CACHE_KV.put(cacheKey, rss2, {
          expirationTtl: maxAge,
          metadata: { expiresAt: Date.now() + maxAge * 1000 },
        });

        ctx.header("Content-Type", "application/rss+xml");
        ctx.header("Cache-Control", `max-age=${maxAge + 1}`);
        return ctx.text(rss2);
      } catch (e: unknown) {
        if (e instanceof Error && e.message == "Rate Limited") {
          ctx.header("Retry-After", `${Math.floor(Math.random() * (240 - 120 + 1)) + 120}`);
          ctx.status(429);
          return ctx.text("Rate Limited");
        }

        throw e;
      }
    },
  );
}
