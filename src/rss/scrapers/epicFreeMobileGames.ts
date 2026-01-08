import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { EpicMobileDiscoverResponse } from "@types";

const BASE_URL = "https://store.epicgames.com/en-US/free-games";

export async function parse(
  json: EpicMobileDiscoverResponse,
  platform: "ios" | "android",
): Promise<RSSData> {
  const freeGames = json.data.find((item) => item.type === "freeGame");

  const entries: RSSEntry[] = (freeGames?.offers ?? [])
    .filter((game) => {
      return game.content.purchase?.find(
        (purchase) => purchase.purchaseType === "Claim" && purchase.price.decimalPrice === 0,
      );
    })
    .map((game) => {
      const title = game.content.title;
      const pageSlug = game.content.mapping.slug;

      const isBundle = game.content.categories?.some((cat) => cat.path === "bundles");
      const link = isBundle
        ? `https://store.epicgames.com/en-US/bundles/${pageSlug}`
        : `https://store.epicgames.com/en-US/p/${pageSlug}`;

      const id = game.content.catalogItemId;

      return {
        id,
        link,
        title,
        text: title,
        datetime: new Date(),
      };
    })
    .filter(isValidRSSEntry);

  const platformLabel = platform === "ios" ? "iOS" : "Android";

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: `Free games: Epic Games Store (${platformLabel})`,
    description: `Free games from Epic Games Store (${platformLabel})`,
    language: "en",
    entries,
  };
}

async function fetchForPlatform(_ctx: ScraperContext, platform: "ios" | "android"): Promise<RSSData> {
  const apiUrl = `https://http-proxy.val.run/?finalUrl=https%3A%2F%2Fegs-platform-service.store.epicgames.com%2Fapi%2Fv2%2Fpublic%2Fdiscover%2Fhome%3Fcount%3D10%26country%3DPT%26locale%3Den%26platform%3D${platform}%26start%3D0%26store%3DEGS`;

  const response = await fetch(apiUrl, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const json = (await response.json()) as EpicMobileDiscoverResponse;
  return parse(json, platform);
}

export async function getiOS(ctx: ScraperContext): Promise<RSSData> {
  return fetchForPlatform(ctx, "ios");
}

export async function getAndroid(ctx: ScraperContext): Promise<RSSData> {
  return fetchForPlatform(ctx, "android");
}
