import type { ScraperContext } from "@rss/common";
import {
  getMangaDexFeed,
  parseMangaDexFeed,
  type MangaDexFeedConfig,
} from "@rss/mangaDex";
import type { RSSData } from "@rss/types";

const config = {
  mangaId: "801513ba-a712-498c-8f57-cae55b38cc92",
  mangaTitle: "Berserk",
  mangaSlug: "berserk",
  language: "en",
  excludedGroupIds: ["48d8a115-31b6-462f-a0db-04cc09846453"],
  limit: 10,
  description: "English Berserk chapter releases from MangaDex",
} satisfies MangaDexFeedConfig;

export function parse(json: unknown): RSSData {
  return parseMangaDexFeed(json, config);
}

export function get(ctx: ScraperContext): Promise<RSSData> {
  return getMangaDexFeed(ctx, config);
}
