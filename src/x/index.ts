import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { Feed } from "feed";
import type {
  XUserByScreenNameResponse,
  XUserTweetsResponse,
  XPost,
  XOEmbedResponse,
  FeedItem,
} from "@types";

async function fetchUserId(env: CloudflareBindings, userName: string): Promise<string> {
  const cacheKey = `fetchUserId:${userName}`;
  const cachedUserId = await env.RUN_GMC_X_CACHE_KV.get(cacheKey);

  if (cachedUserId) return cachedUserId;

  const response = await fetch(
    `https://x.com/i/api/graphql/QGIw94L0abhuohrr76cSbw/UserByScreenName?variables=%7B%22screen_name%22%3A%22${userName}%22%7D&features=%7B%22hidden_profile_subscriptions_enabled%22%3Atrue%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%2C%22subscriptions_verification_info_is_identity_verified_enabled%22%3Atrue%2C%22subscriptions_verification_info_verified_since_enabled%22%3Atrue%2C%22highlights_tweets_tab_ui_enabled%22%3Atrue%2C%22responsive_web_twitter_article_notes_tab_enabled%22%3Atrue%2C%22subscriptions_feature_can_gift_premium%22%3Atrue%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%7D&fieldToggles=%7B%22withAuxiliaryUserLabels%22%3Afalse%7D`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
        authorization: `Bearer ${env.X_BEARER}`,
        "content-type": "application/json",
        dnt: "1",
        priority: "u=1, i",
        "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-client-transaction-id":
          "udHa734ZeSBqnvzPqPG94NSh/3QuYCdvr9Yj/Z8PTCwCb19u+P//mW1AROJoG3Te/pJJsLqVjvexVwSq5cHAhLFUVOJAug",
        "x-csrf-token": env.X_CSRF_TOKEN,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "en",
        cookie: env.X_COOKIE,
      },
      method: "GET",
    },
  );

  if (response.status == 429) throw new Error("Rate Limited");

  const json = (await response.json()) as XUserByScreenNameResponse;
  const userId = json.data.user.result.rest_id;

  await env.RUN_GMC_X_CACHE_KV.put(cacheKey, userId, { expirationTtl: 1209600 });

  return userId;
}

async function fetchPosts(env: CloudflareBindings, userId: string): Promise<XUserTweetsResponse> {
  const response = await fetch(
    `https://x.com/i/api/graphql/1mDAyxlBlMp6uokkzihecQ/UserTweets?variables=%7B%22userId%22%3A%22${userId}%22%2C%22count%22%3A50%2C%22includePromotedContent%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withV2Timeline%22%3Atrue%7D&features=%7B%22profile_label_improvements_pcf_label_in_post_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22creator_subscriptions_quote_tweet_preview_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22rweb_video_timestamps_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticlePlainText%22%3Afalse%7D`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
        authorization: `Bearer ${env.X_BEARER}`,
        "content-type": "application/json",
        dnt: "1",
        priority: "u=1, i",
        "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": env.X_CSRF_TOKEN,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "en",
        cookie: env.X_COOKIE,
      },
      method: "GET",
    },
  );

  if (response.status == 429) throw new Error("Rate Limited");
  return (await response.json()) as XUserTweetsResponse;
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
  const json = (await response.json()) as XOEmbedResponse;

  await env.RUN_GMC_X_CACHE_KV.put(postUrl, json.html, { expirationTtl: 1209600 });

  return json.html;
}

async function x2Rss(env: CloudflareBindings, userName: string, data: XUserTweetsResponse) {
  const entries =
    data.data.user.result.timeline_v2.timeline.instructions.find(
      (instruction) => instruction.entries,
    )?.entries || [];
  const firstUser =
    entries?.[0]?.content?.itemContent?.tweet_results?.result?.core?.user_results?.result?.legacy;

  const feed = new Feed({
    title: `X // ${firstUser?.name || userName}`,
    description: firstUser?.description || userName,
    id: `https://x.com/${firstUser?.screen_name || userName}`,
    link: `https://x.com/${firstUser?.screen_name || userName}`,
    language: "en",
    image: firstUser?.profile_image_url_https,
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

    const post = await transformPost(env, entry.content?.itemContent?.tweet_results?.result);
    if (post) {
      feed.addItem(post);
    }

    if (entry.content?.items?.[0]?.item?.itemContent?.promotedMetadata) continue;
    const threadedPost = await transformPost(
      env,
      entry.content?.items?.[0]?.item?.itemContent?.tweet_results?.result,
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
    async (c, next) => {
      const auth = basicAuth({
        username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
        password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
      });
      return auth(c, next);
    },
    async (c) => {
      const userName = c.req.query("userName");

      if (!userName) {
        c.status(400);
        return c.text("no userName provided");
      }

      try {
        const userId = await fetchUserId(c.env, userName);
        const data = await fetchPosts(c.env, userId);
        const feed = await x2Rss(c.env, userName, data);

        const rss2 = feed.rss2();

        c.header("Content-Type", "application/rss+xml");
        c.header("Cache-Control", `${Math.floor(Math.random() * (2400 - 1200 + 1)) + 1200}`);
        return c.text(rss2);
      } catch (e: unknown) {
        if (e instanceof Error && e.message == "Rate Limited") {
          c.header("Retry-After", `${Math.floor(Math.random() * (240 - 120 + 1)) + 120}`);
          c.status(429);
          return c.text("Rate Limited");
        }

        throw e;
      }
    },
  );
}
