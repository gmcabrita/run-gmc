import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  number,
  parse as parseValibot,
  string,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://store.epicgames.com/en-US/free-games";
const API_URL =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=PT&allowCountries=PT";

const CatalogMappingSchema = looseObject({
  pageSlug: string(),
  pageType: string(),
});
const PromotionalOfferSchema = looseObject({
  discountSetting: looseObject({ discountPercentage: number() }),
  endDate: string(),
  startDate: string(),
});
const EpicDesktopFreeGamesPayloadSchema = looseObject({
  data: looseObject({
    Catalog: looseObject({
      searchStore: looseObject({
        elements: array(
          looseObject({
            catalogNs: nullish(
              looseObject({
                mappings: nullish(array(CatalogMappingSchema)),
                offerMappings: nullish(array(CatalogMappingSchema)),
              }),
            ),
            categories: nullish(
              array(looseObject({ path: string() })),
            ),
            id: string(),
            productSlug: nullish(string()),
            promotions: nullish(
              looseObject({
                promotionalOffers: array(
                  looseObject({
                    promotionalOffers: array(PromotionalOfferSchema),
                  }),
                ),
              }),
            ),
            title: string(),
          }),
        ),
      }),
    }),
  }),
});

type EpicDesktopFreeGamesPayload = InferOutput<
  typeof EpicDesktopFreeGamesPayloadSchema
>;
type EpicDesktopGame =
  EpicDesktopFreeGamesPayload["data"]["Catalog"]["searchStore"]["elements"][number];
type PromotionalOffer = InferOutput<typeof PromotionalOfferSchema>;

function getActivePromotionalOffer(
  game: EpicDesktopGame,
  nowDate: Date,
): PromotionalOffer | undefined {
  return game.promotions?.promotionalOffers
    .flatMap((offers) => offers.promotionalOffers)
    .find((offer) => {
      const startDate = new Date(offer.startDate);
      const endDate = new Date(offer.endDate);
      return (
        startDate <= nowDate &&
        nowDate <= endDate &&
        offer.discountSetting.discountPercentage === 0
      );
    });
}

export async function parse(
  json: EpicDesktopFreeGamesPayload,
  nowDate: Date = new Date(),
): Promise<RSSData> {
  const entries: Array<RSSEntry> = json.data.Catalog.searchStore.elements
    .flatMap((game) => {
      const promotionalOffer = getActivePromotionalOffer(game, nowDate);
      if (!promotionalOffer) {
        return [];
      }

      const pageSlug =
        game.catalogNs?.mappings?.find((mapping) => mapping.pageType === "productHome")
          ?.pageSlug ??
        game.catalogNs?.offerMappings?.find((mapping) => mapping.pageType === "productHome")
          ?.pageSlug ??
        game.productSlug;
      const isBundle = game.categories?.some((category) => category.path === "bundles");
      const link = isBundle
        ? `https://store.epicgames.com/en-US/bundles/${pageSlug}`
        : `https://store.epicgames.com/en-US/p/${pageSlug}`;

      return [
        {
          datetime: new Date(promotionalOffer.startDate),
          id: game.id,
          link,
          text: game.title,
          title: game.title,
        },
      ];
    })
    .filter(isValidRSSEntry);

  return {
    description: "Free games from Epic Games Store",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Free games: Epic Games Store",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const json = parseValibot(EpicDesktopFreeGamesPayloadSchema, await response.json());
  return parse(json);
}
