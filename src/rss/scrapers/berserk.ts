import type { ScraperContext } from "@rss/common";
import {
  getMangaDexFeed,
  parseMangaDexFeed,
  type MangaDexFeedConfig,
  type MangaDexFeedPayload,
} from "@rss/mangaDex";
import type { RSSData } from "@rss/types";

const config = {
  description: "English Berserk chapter releases from MangaDex",
  excludedGroupIds: ["48d8a115-31b6-462f-a0db-04cc09846453"],
  language: "en",
  limit: 10,
  mangaId: "801513ba-a712-498c-8f57-cae55b38cc92",
  mangaSlug: "berserk",
  mangaTitle: "Berserk",
} satisfies MangaDexFeedConfig;

export function parse(payload: MangaDexFeedPayload): RSSData {
  return parseMangaDexFeed(payload, config);
}

export function get(ctx: ScraperContext): Promise<RSSData> {
  return getMangaDexFeed(ctx, config);
}
