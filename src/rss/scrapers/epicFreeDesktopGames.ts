import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const BASE_URL = "https://store.epicgames.com/en-US/free-games";
const API_URL =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=PT&allowCountries=PT";

const CatalogMappingSchema = v.looseObject({
  pageType: v.string(),
  pageSlug: v.string(),
});
const PromotionalOfferSchema = v.looseObject({
  startDate: v.string(),
  endDate: v.string(),
  discountSetting: v.looseObject({ discountPercentage: v.number() }),
});
const EpicDesktopFreeGamesPayloadSchema = v.looseObject({
  data: v.looseObject({
    Catalog: v.looseObject({
      searchStore: v.looseObject({
        elements: v.array(
          v.looseObject({
            id: v.string(),
            title: v.string(),
            productSlug: v.nullish(v.string()),
            categories: v.nullish(
              v.array(v.looseObject({ path: v.string() })),
            ),
            catalogNs: v.nullish(
              v.looseObject({
                mappings: v.nullish(v.array(CatalogMappingSchema)),
                offerMappings: v.nullish(v.array(CatalogMappingSchema)),
              }),
            ),
            promotions: v.nullish(
              v.looseObject({
                promotionalOffers: v.array(
                  v.looseObject({
                    promotionalOffers: v.array(PromotionalOfferSchema),
                  }),
                ),
              }),
            ),
          }),
        ),
      }),
    }),
  }),
});

type EpicDesktopFreeGamesPayload = v.InferOutput<
  typeof EpicDesktopFreeGamesPayloadSchema
>;
type EpicDesktopGame =
  EpicDesktopFreeGamesPayload["data"]["Catalog"]["searchStore"]["elements"][number];
type PromotionalOffer = v.InferOutput<typeof PromotionalOfferSchema>;

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
  const entries: RSSEntry[] = json.data.Catalog.searchStore.elements
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
          id: game.id,
          link,
          title: game.title,
          text: game.title,
          datetime: new Date(promotionalOffer.startDate),
        },
      ];
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Free games: Epic Games Store",
    description: "Free games from Epic Games Store",
    language: "en",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const json = v.parse(EpicDesktopFreeGamesPayloadSchema, await response.json());
  return parse(json);
}
