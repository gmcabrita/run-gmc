import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  parse as parseValibot,
  string,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://discord.com/quest-home";

const DiscordQuestsPayloadSchema = looseObject({
  quests: array(
    looseObject({
      config: looseObject({
        application: looseObject({ link: string() }),
        expires_at: nullish(string()),
        messages: looseObject({
          game_publisher: string(),
          game_title: string(),
          quest_name: string(),
        }),
        rewards_config: looseObject({
          rewards: array(
            looseObject({
              messages: looseObject({ name: string() }),
            }),
          ),
        }),
        starts_at: string(),
      }),
      id: string(),
      user_status: nullish(
        looseObject({ claimed_at: nullish(string()) }),
      ),
    }),
  ),
});

type DiscordQuestsPayload = InferOutput<typeof DiscordQuestsPayloadSchema>;

export function parse(json: DiscordQuestsPayload, nowDate: Date = new Date()): RSSData {
  const entries: Array<RSSEntry> = json.quests
    .filter((quest) => {
      const expiresAt = quest.config.expires_at;
      const claimedAt = quest.user_status?.claimed_at;

      // Not expired (expires_at is null or in the future)
      const notExpired = !expiresAt || new Date(expiresAt) > nowDate;

      // Not claimed (claimed_at is null)
      const notClaimed = !claimedAt;

      return notExpired && notClaimed;
    })
    .map((quest) => {
      const { config } = quest;
      const rewardNames = config.rewards_config.rewards.map((r) => r.messages.name).join(", ");
      const text = `<strong>Publisher:</strong> ${config.messages.game_publisher}<br><strong>Reward:</strong> ${rewardNames}<br><strong>Expires:</strong> ${config.expires_at}`;

      return {
        datetime: new Date(config.starts_at),
        id: quest.id,
        link: config.application.link,
        text,
        title: `${config.messages.quest_name} - ${config.messages.game_title}`,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Available Discord Quests",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Discord Quests",
  };
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch("https://discord.com/api/v9/quests/@me", {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
      authorization: ctx.env.DISCORD_AUTHORIZATION_TOKEN,
      priority: "u=1, i",
      "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-debug-options": "bugReporterEnabled",
      "x-discord-locale": "en-US",
      "x-discord-timezone": "Europe/Lisbon",
      "x-super-properties":
        "eyJvcyI6Ik1hYyBPUyBYIiwiYnJvd3NlciI6IkNocm9tZSIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJlbi1VUyIsImhhc19jbGllbnRfbW9kcyI6ZmFsc2UsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xNDMuMC4wLjAgU2FmYXJpLzUzNy4zNiIsImJyb3dzZXJfdmVyc2lvbiI6IjE0My4wLjAuMCIsIm9zX3ZlcnNpb24iOiIxMC4xNS43IiwicmVmZXJyZXIiOiJodHRwczovL3d3dy5nb29nbGUuY29tLyIsInJlZmVycmluZ19kb21haW4iOiJ3d3cuZ29vZ2xlLmNvbSIsInNlYXJjaF9lbmdpbmUiOiJnb29nbGUiLCJyZWZlcnJlcl9jdXJyZW50IjoiIiwicmVmZXJyaW5nX2RvbWFpbl9jdXJyZW50IjoiIiwicmVsZWFzZV9jaGFubmVsIjoic3RhYmxlIiwiY2xpZW50X2J1aWxkX251bWJlciI6NDgzNDIyLCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsLCJjbGllbnRfbGF1bmNoX2lkIjoiYzU3M2FjYjItNTdjZC00MDUwLWI1Y2ItNTkxYTgwZjA2YjdhIiwibGF1bmNoX3NpZ25hdHVyZSI6IjEzNDVlZjA4LTkxYmMtNDM4Zi04ODQ2LTU5YmEwMjY1ZjA0MiIsImNsaWVudF9oZWFydGJlYXRfc2Vzc2lvbl9pZCI6ImI5NGEwYTcxLTA2ZTMtNGZhYi1iM2EzLTE2ZWM0OWM2ZDM1ZiIsImNsaWVudF9hcHBfc3RhdGUiOiJ1bmZvY3VzZWQifQ==",
    },
    method: "GET",
  });

  const json = parseValibot(DiscordQuestsPayloadSchema, await response.json());
  return parse(json);
}
