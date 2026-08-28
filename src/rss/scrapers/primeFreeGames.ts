import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  parse as parseValibot,
  string,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://gaming.amazon.com/home";
const GRAPHQL_URL = "https://gaming.amazon.com/graphql";

const GRAPHQL_QUERY = `query OffersContext_Offers_And_Items($dateOverride: Time, $pageSize: Int) {
  inGameLoot: items(collectionType: LOOT, dateOverride: $dateOverride, pageSize: $pageSize) {
    items {
      ...Item
      __typename
    }
    __typename
  }
  expiring: items(collectionType: EXPIRING, dateOverride: $dateOverride) {
    items {
      ...Item
      __typename
    }
    __typename
  }
  popular: items(collectionType: FEATURED, dateOverride: $dateOverride) {
    items {
      ...Item
      __typename
    }
    __typename
  }
  games: items(collectionType: FREE_GAMES, dateOverride: $dateOverride, pageSize: $pageSize) {
    items {
      ...Item
      __typename
    }
    __typename
  }
  eventRow1: items(collectionType: EVENT_ROW_1, dateOverride: $dateOverride, pageSize: $pageSize) {
    items {
      ...Item
      __typename
    }
    __typename
  }
  eventRow2: items(collectionType: EVENT_ROW_2, dateOverride: $dateOverride, pageSize: $pageSize) {
    items {
      ...Item
      __typename
    }
    __typename
  }
  featuredContent: items(collectionType: FEATURED_CONTENT, dateOverride: $dateOverride, pageSize: $pageSize) {
    items {
      id
      __typename
    }
    __typename
  }
}

fragment Item on Item {
  id
  isFGWP
  isDirectEntitlement
  isRetailLinkItem
  grantsCode
  priority
  category
  ctaButtonText
  isTeaserCard
  showCountdownInHours
  assets {
    id
    title
    externalClaimLink
    shortformDescription
    cardMedia {
      defaultMedia {
        src1x
        src2x
        type
        __typename
      }
      __typename
    }
    __typename
  }
  product {
    id
    __typename
  }
  offers {
    id
    startTime
    endTime
    offerSelfConnection {
      eligibility {
        canClaim
        isClaimed
        isPrimeGaming
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}`;

const PrimeGamingPayloadSchema = looseObject({
  data: looseObject({
    games: looseObject({
      items: array(
        looseObject({
          assets: looseObject({
            externalClaimLink: nullish(string()),
            id: string(),
            title: nullish(string()),
          }),
          offers: array(looseObject({ startTime: string() })),
        }),
      ),
    }),
  }),
});

type PrimeGamingPayload = InferOutput<typeof PrimeGamingPayloadSchema>;

export function parse(json: PrimeGamingPayload): RSSData {
  const entries: Array<RSSEntry> = json.data.games.items
    .flatMap((game) => {
      const { externalClaimLink, id, title } = game.assets;
      const offer = game.offers[0];
      if (title == null || externalClaimLink == null || !offer) {
        return [];
      }

      return [
        {
          datetime: new Date(offer.startTime),
          id,
          link: externalClaimLink,
          text: title,
          title,
        },
      ];
    })
    .filter(isValidRSSEntry);

  return {
    description: "Free games from Prime Gaming",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Free games: Prime Gaming",
  };
}

async function fetchCsrfTokenAndCookie(): Promise<{ cookie: string; csrfToken: string }> {
  const initialResponse = await fetch(BASE_URL);
  const cookie = (initialResponse.headers.get("set-cookie") ?? "")
    .split("Secure, ")
    .map((item: string) => item.split(";")[0])
    .join("; ");

  let csrfToken = "";

  const rewriter = new HTMLRewriter().on('input[name*="csrf-key"]', {
    element(element) {
      csrfToken = element.getAttribute("value") || "";
    },
  });

  const rewritten = rewriter.transform(initialResponse);
  await consume(rewritten.body!);

  return { cookie, csrfToken };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const { cookie, csrfToken } = await fetchCsrfTokenAndCookie();

  const response = await fetch(GRAPHQL_URL, {
    body: JSON.stringify({
      extensions: {},
      operationName: "OffersContext_Offers_And_Items",
      query: GRAPHQL_QUERY,
      variables: { pageSize: 999 },
    }),
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "client-id": "CarboniteApp",
      "content-type": "application/json",
      cookie: cookie,
      "csrf-token": csrfToken,
      pragma: "no-cache",
      "prime-gaming-language": "en-US",
      referer: BASE_URL,
      "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": USERAGENT,
    },
    method: "POST",
  });

  const json = parseValibot(PrimeGamingPayloadSchema, await response.json());
  return parse(json);
}
