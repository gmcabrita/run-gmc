import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  number,
  parse as parseValibot,
  string,
  unknown,
  type InferInput,
} from "valibot";

const BASE_URL = "https://store.epicgames.com/en-US/free-games";

const EpicMobileOfferSchema = looseObject({
  content: looseObject({
    catalogItemId: string(),
    categories: nullish(array(string())),
    mapping: looseObject({ slug: string() }),
    purchase: nullish(
      array(
        looseObject({
          price: looseObject({ decimalPrice: number() }),
          purchaseType: string(),
        }),
      ),
    ),
    title: string(),
  }),
});
const EpicMobileDiscoverPayloadSchema = looseObject({
  data: array(
    looseObject({
      offers: array(unknown()),
      type: string(),
    }),
  ),
});

type EpicMobileDiscoverPayload = InferInput<typeof EpicMobileDiscoverPayloadSchema>;

export async function parse(
  payload: EpicMobileDiscoverPayload,
  platform: "ios" | "android",
): Promise<RSSData> {
  const json = parseValibot(EpicMobileDiscoverPayloadSchema, payload);
  const freeGames = json.data.find((item) => item.type === "freeGame");
  const offers = parseValibot(array(EpicMobileOfferSchema), freeGames?.offers ?? []);

  const entries: Array<RSSEntry> = offers
    .filter((game) => {
      return game.content.purchase?.find(
        (purchase) => purchase.purchaseType === "Claim" && purchase.price.decimalPrice === 0,
      );
    })
    .map((game) => {
      const title = game.content.title;
      const pageSlug = game.content.mapping.slug;

      const isBundle = game.content.categories?.includes("bundles");
      const link = isBundle
        ? `https://store.epicgames.com/en-US/bundles/${pageSlug}`
        : `https://store.epicgames.com/en-US/p/${pageSlug}`;

      const id = game.content.catalogItemId;

      return {
        datetime: new Date(),
        id,
        link,
        text: title,
        title,
      };
    })
    .filter(isValidRSSEntry);

  const platformLabel = platform === "ios" ? "iOS" : "Android";

  return {
    description: `Free games from Epic Games Store (${platformLabel})`,
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: `Free games: Epic Games Store (${platformLabel})`,
  };
}

async function fetchForPlatform(
  _ctx: ScraperContext,
  platform: "ios" | "android",
): Promise<RSSData> {
  const apiUrl = `https://http-proxy.val.run/?finalUrl=https%3A%2F%2Fegs-platform-service.store.epicgames.com%2Fapi%2Fv2%2Fpublic%2Fdiscover%2Fhome%3Fcount%3D10%26country%3DPT%26locale%3Den%26platform%3D${platform}%26start%3D0%26store%3DEGS`;

  const response = await fetch(apiUrl, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  return parse(await response.json(), platform);
}

export async function getiOS(ctx: ScraperContext): Promise<RSSData> {
  return fetchForPlatform(ctx, "ios");
}

export async function getAndroid(ctx: ScraperContext): Promise<RSSData> {
  return fetchForPlatform(ctx, "android");
}
