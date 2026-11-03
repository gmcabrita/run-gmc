import { parse } from "valibot";
import {
  parseScreenName,
  parseTargetList,
  X_BROWSER_USER_AGENT,
  type BlocklistSource,
  type BlocklistTarget,
  type BlocklistTargetList,
} from "./blocklist";
import { buildXApiHeaders, getDefaultCredentials } from "./credentials";
import {
  NobotsSuspectsResponseSchema,
  XListMembersResponseSchema,
  type NobotsSuspectsResponse,
  type XListMembersResponse,
} from "./schemas";

// To add a source, write a `BlocklistSource` and add it to `X_BLOCKLIST_SOURCES`.
// Use `parseScreenName` for handles and `parseUserId` for numeric user IDs.

const CLANKWALL_USERNAMES_URL = "https://clankwall.vogel.dev/api/usernames.txt";

export const clankwallSource: BlocklistSource = {
  async fetchTargets() {
    const response = await fetch(CLANKWALL_USERNAMES_URL);
    if (!response.ok) {
      throw new Error(`${CLANKWALL_USERNAMES_URL} returned HTTP ${response.status}`);
    }
    return parseTargetList(await response.text(), parseScreenName);
  },
  name: "clankwall",
};

const NOBOTS_SUSPECTS_URL = "https://nobots.fyi/suspects.json";
// Only suspects with a bot score at or above this value are muted and blocked.
const NOBOTS_MIN_SCORE = 80;

export function parseNobotsSuspects(suspects: NobotsSuspectsResponse): BlocklistTargetList {
  const targets: Array<BlocklistTarget> = [];
  const invalid: Array<string> = [];
  for (const { h, s } of suspects) {
    if (s < NOBOTS_MIN_SCORE) {
      continue;
    }
    const target = parseScreenName(h);
    if (target) {
      targets.push(target);
    } else {
      invalid.push(h);
    }
  }
  return { invalid, targets };
}

export const nobotsSource: BlocklistSource = {
  async fetchTargets() {
    const response = await fetch(NOBOTS_SUSPECTS_URL);
    if (!response.ok) {
      throw new Error(`${NOBOTS_SUSPECTS_URL} returned HTTP ${response.status}`);
    }
    return parseNobotsSuspects(parse(NobotsSuspectsResponseSchema, await response.json()));
  },
  name: "nobots",
};

const X_LIST_MEMBERS_URL = "https://x.com/i/api/graphql/_RDpx--fQKSccuRlGpEIoA/ListMembers";
const X_LIST_MEMBERS_PAGE_SIZE = 100;
// Stops a cursor loop if X keeps returning new cursors. 50 pages hold 5000 members.
const X_LIST_MEMBERS_MAX_PAGES = 50;

// Copied from an x.com browser request. X rejects the request if a required feature is missing.
const X_LIST_MEMBERS_FEATURES = {
  articles_preview_enabled: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  content_disclosure_indicator_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  post_ctas_fetch_enabled: false,
  premium_content_api_read_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_grok_analysis_button_from_backend: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_made_on_x_label_enabled: false,
  responsive_web_nested_quote_preview_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  rweb_cashtags_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  rweb_sports_post_context_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  rweb_video_screen_enabled: false,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  verified_phone_label_enabled: false,
  view_counts_everywhere_api_enabled: true,
  x_elections_post_context_enabled: true,
};

export type XListMembersPage = {
  // Undefined on the last page.
  nextCursor: string | undefined;
  userIds: Array<string>;
};

export function parseListMembersPage(response: XListMembersResponse): XListMembersPage {
  const userIds: Array<string> = [];
  let bottomCursor: string | undefined;
  for (const instruction of response.data.list.members_timeline.timeline.instructions) {
    for (const entry of instruction.entries ?? []) {
      const userId = entry.content.itemContent?.user_results?.result?.rest_id;
      if (entry.entryId.startsWith("user-") && userId) {
        userIds.push(userId);
      } else if (entry.content.cursorType === "Bottom" && entry.content.value) {
        bottomCursor = entry.content.value;
      }
    }
  }
  // X still returns a bottom cursor after the last member. A page with no members is the end.
  return { nextCursor: userIds.length > 0 ? bottomCursor : undefined, userIds };
}

export function buildListMembersUrl(listId: string, cursor: string | undefined): string {
  const url = new URL(X_LIST_MEMBERS_URL);
  url.searchParams.set(
    "variables",
    JSON.stringify({ count: X_LIST_MEMBERS_PAGE_SIZE, cursor, listId }),
  );
  url.searchParams.set("features", JSON.stringify(X_LIST_MEMBERS_FEATURES));
  return url.toString();
}

// Reads the members of an X list with the default account (`X_COOKIE`).
// The account must be able to see the list.
export function createXListMembersSource(listId: string): BlocklistSource {
  return {
    async fetchTargets(env): Promise<BlocklistTargetList> {
      const credentials = getDefaultCredentials(env);
      const targets: Array<BlocklistTarget> = [];
      let cursor: string | undefined;
      for (let page = 0; page < X_LIST_MEMBERS_MAX_PAGES; page++) {
        const url = buildListMembersUrl(listId, cursor);
        const response = await fetch(url, {
          headers: buildXApiHeaders(credentials, { "user-agent": X_BROWSER_USER_AGENT }),
        });
        if (!response.ok) {
          throw new Error(`X list ${listId} members returned HTTP ${response.status}`);
        }
        const { nextCursor, userIds } = parseListMembersPage(
          parse(XListMembersResponseSchema, await response.json()),
        );
        targets.push(...userIds.map((userId): BlocklistTarget => ({ kind: "userId", userId })));
        if (!nextCursor) {
          return { invalid: [], targets };
        }
        cursor = nextCursor;
      }
      throw new Error(
        `X list ${listId} has more than ${X_LIST_MEMBERS_MAX_PAGES} pages of members`,
      );
    },
    name: `xList:${listId}`,
  };
}

// X lists whose members are muted and blocked. Each list is a separate source,
// so a failure on one list does not stop the others. A member of more than one
// list is handled once for each run.
export const X_BLOCKLIST_LIST_IDS: ReadonlyArray<string> = ["2116659176894071283"];

export const X_BLOCKLIST_SOURCES: ReadonlyArray<BlocklistSource> = [
  clankwallSource,
  nobotsSource,
  ...X_BLOCKLIST_LIST_IDS.map(createXListMembersSource),
];
