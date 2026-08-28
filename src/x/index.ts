import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { Feed } from "feed";
import { stripInvalidXmlChars } from "@rss/common";
import type { FeedItem } from "@types";
import { parse } from "valibot";
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

  if (response.status == 429) {throw new Error("Rate Limited");}

  return parse(XUserByScreenNameResponseSchema, await response.json());
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

  if (response.status == 429) {throw new Error("Rate Limited");}
  return parse(XUserTweetsResponseSchema, await response.json());
}

async function transformPost(
  env: CloudflareBindings,
  post: XPost | undefined,
): Promise<FeedItem | undefined> {
  if (post?.legacy && post.core) {
    const postUrl = `https://x.com/${post.core.user_results.result.legacy.screen_name}/status/${post.legacy.id_str}`;

    return {
      author: [
        {
          link: `https://x.com/${post.core.user_results.result.legacy.screen_name}`,
          name: post.core.user_results.result.legacy.name,
        },
      ],
      content: (await getEmbedWithRetries(env, postUrl, 2)) ?? "",
      date: new Date(post.legacy.created_at),
      id: post.legacy.id_str,
      link: postUrl,
      title:
        post.legacy.full_text.slice(0, 50) + (post.legacy.full_text.length > 50 ? "..." : ""),
    };
  }
}

async function getEmbedWithRetries(
  env: CloudflareBindings,
  postUrl: string,
  retryCount: number,
): Promise<string | undefined> {
  let lastError;
  for (let i = 0; i < retryCount; i++) {
    try {
      return await getEmbed(env, postUrl);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {throw lastError;}
}

async function getEmbed(env: CloudflareBindings, postUrl: string): Promise<string> {
  const cachedHtml = await env.RUN_GMC_X_CACHE_KV.get(postUrl);

  if (cachedHtml) {return cachedHtml;}

  const response = await fetch(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(postUrl)}`,
  );
  const json = parse(XOEmbedResponseSchema, await response.json());

  await env.RUN_GMC_X_CACHE_KV.put(postUrl, json.html, { expirationTtl: 1_209_600 });

  return json.html;
}

type TimelineEntry = ReturnType<typeof getTimelineEntries>[number];

type TimelineItemContent = ReturnType<typeof getDirectItemContent>;

function getDirectItemContent(entry: TimelineEntry) {
  return entry.content?.itemContent;
}

function getThreadedItemContent(entry: TimelineEntry) {
  return entry.content?.items?.[0]?.item?.itemContent;
}

function getPostFromItemContent(itemContent: TimelineItemContent): XPost | undefined {
  return itemContent?.tweet_results?.result ?? undefined;
}

function isPromotedItem(itemContent: TimelineItemContent): boolean {
  return Boolean(itemContent?.promotedMetadata);
}

function getEntryPosts(entry: TimelineEntry): Array<XPost | undefined> {
  const directItem = getDirectItemContent(entry);
  if (isPromotedItem(directItem)) {return [];}

  const directPost = getPostFromItemContent(directItem);
  const threadedItem = getThreadedItemContent(entry);
  if (isPromotedItem(threadedItem)) {return [directPost];}

  return [directPost, getPostFromItemContent(threadedItem)];
}

function getFirstTimelineUser(entries: ReadonlyArray<TimelineEntry>) {
  const firstEntry = entries[0];
  if (!firstEntry) {return;}
  return getPostFromItemContent(getDirectItemContent(firstEntry))?.core?.user_results.result.legacy;
}

function getXFeedMetadata(
  userName: string,
  firstUser: ReturnType<typeof getFirstTimelineUser>,
) {
  const screenName = firstUser?.screen_name;
  const name = firstUser?.name;
  return {
    authorLink: `https://x.com/${screenName}`,
    authorName: name || "",
    copyrightName: name,
    description: firstUser?.description || userName,
    identityName: name || userName,
    identityUrl: `https://x.com/${screenName || userName}`,
    image: firstUser?.profile_image_url_https ?? undefined,
  };
}

function createXFeed(userName: string, entries: ReadonlyArray<TimelineEntry>): Feed {
  const metadata = getXFeedMetadata(userName, getFirstTimelineUser(entries));
  return new Feed({
    author: {
      link: metadata.authorLink,
      name: metadata.authorName,
    },
    copyright: `All rights reserved ${new Date().getFullYear()}, ${metadata.copyrightName}`,
    description: metadata.description,
    favicon: "https://x.com/favicon.ico",
    generator: "X2RSS",
    id: metadata.identityUrl,
    image: metadata.image,
    language: "en",
    link: metadata.identityUrl,
    title: `X // ${metadata.identityName}`,
    updated: new Date(),
  });
}

async function x2Rss(env: CloudflareBindings, userName: string, data: XUserTweetsResponse) {
  const entries = getTimelineEntries(data);
  const feed = createXFeed(userName, entries);

  for (const entry of entries) {
    for (const candidate of getEntryPosts(entry)) {
      const post = await transformPost(env, candidate);
      if (post) {feed.addItem(post);}
    }
  }

  return feed;
}

export function addXEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get(
    "/rss.x",
    async (ctx, next) => {
      const auth = basicAuth({
        password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
        username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
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

        const { metadata, value: cachedRss } = await ctx.env.RUN_GMC_X_CACHE_KV.getWithMetadata<{
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
      } catch (error: unknown) {
        if (error instanceof Error && error.message == "Rate Limited") {
          ctx.header("Retry-After", `${Math.floor(Math.random() * (240 - 120 + 1)) + 120}`);
          ctx.status(429);
          return ctx.text("Rate Limited");
        }

        throw error;
      }
    },
  );
}
