import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { PrimeGamingResponse } from "@types";

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

export function parse(json: PrimeGamingResponse): RSSData {
  const entries: RSSEntry[] = json.data.games.items
    .filter((game) => game.assets.title != null && game.assets.externalClaimLink != null)
    .map((game) => ({
      id: game.assets.id,
      link: game.assets.externalClaimLink,
      title: game.assets.title,
      text: game.assets.title,
      datetime: new Date(game.offers[0].startTime),
    }))
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Free games: Prime Gaming",
    description: "Free games from Prime Gaming",
    language: "en",
    entries,
  };
}

async function fetchCsrfTokenAndCookie(): Promise<{ csrfToken: string; cookie: string }> {
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

  return { csrfToken, cookie };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const { csrfToken, cookie } = await fetchCsrfTokenAndCookie();

  const response = await fetch(GRAPHQL_URL, {
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
      "user-agent": USERAGENT,
      "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      referer: BASE_URL,
    },
    body: JSON.stringify({
      operationName: "OffersContext_Offers_And_Items",
      variables: { pageSize: 999 },
      extensions: {},
      query: GRAPHQL_QUERY,
    }),
    method: "POST",
  });

  const json = (await response.json()) as PrimeGamingResponse;
  return parse(json);
}
