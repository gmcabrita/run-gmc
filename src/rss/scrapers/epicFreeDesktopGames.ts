import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { EpicDesktopFreeGamesResponse } from "@types";

const BASE_URL = "https://store.epicgames.com/en-US/free-games";
const API_URL =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=PT&allowCountries=PT";

export async function parse(
  json: EpicDesktopFreeGamesResponse,
  nowDate: Date = new Date(),
): Promise<RSSData> {
  const entries: RSSEntry[] = json.data.Catalog.searchStore.elements
    .filter((offer) => {
      if (offer.promotions) {
        return offer.promotions.promotionalOffers.some((innerOffers) => {
          return innerOffers.promotionalOffers.some((pOffer) => {
            const startDate = new Date(pOffer.startDate);
            const endDate = new Date(pOffer.endDate);
            const isFree = pOffer.discountSetting.discountPercentage === 0;
            return startDate <= nowDate && nowDate <= endDate && isFree;
          });
        });
      }
      return false;
    })
    .map((game) => {
      const pageSlug =
        game?.catalogNs?.mappings?.find((mapping) => mapping.pageType === "productHome")
          ?.pageSlug ??
        game?.catalogNs?.offerMappings?.find((mapping) => mapping.pageType === "productHome")
          ?.pageSlug ??
        game.productSlug;

      const isBundle = game.categories?.some((cat) => cat.path === "bundles");
      const link = isBundle
        ? `https://store.epicgames.com/en-US/bundles/${pageSlug}`
        : `https://store.epicgames.com/en-US/p/${pageSlug}`;

      const promoOffer = game
        .promotions!.promotionalOffers.map((innerOffers) =>
          innerOffers.promotionalOffers.find((pOffer) => {
            const startDate = new Date(pOffer.startDate);
            const endDate = new Date(pOffer.endDate);
            const isFree = pOffer.discountSetting.discountPercentage === 0;
            return startDate <= nowDate && nowDate <= endDate && isFree;
          }),
        )
        .filter(Boolean)[0]!;

      return {
        id: game.id,
        link,
        title: game.title,
        text: game.title,
        datetime: new Date(promoOffer.startDate),
      };
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

  const json = (await response.json()) as EpicDesktopFreeGamesResponse;
  return parse(json);
}
