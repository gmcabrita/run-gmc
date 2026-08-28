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

const BASE_URL = "https://www.ucicinemas.pt/promocoes/";
const API_URL =
  "https://www.ucicinemas.pt/api/omnia/v1/pageList?friendly=/promocoes/&properties=promotionImage&properties=header&properties=introText";
const IMAGE_BASE_URL = "https://www.ucicinemas.pt";

const UciPromocoesPayloadSchema = array(
  looseObject({
    createDate: string(),
    header: nullish(string()),
    introText: nullish(string()),
    name: string(),
    nodeId: number(),
    promotionImage: nullish(
      looseObject({ desktop: string() }),
    ),
    url: string(),
  }),
);

type UciPromocoesPayload = InferOutput<typeof UciPromocoesPayloadSchema>;

export function parse(json: UciPromocoesPayload): RSSData {
  const entries: Array<RSSEntry> = json
    .map((promo) => {
      const link = new URL(promo.url, BASE_URL).href;
      const imageUrl = promo.promotionImage?.desktop
        ? new URL(promo.promotionImage.desktop, IMAGE_BASE_URL).href
        : undefined;

      // Strip HTML tags from introText for the text field
      const text = promo.introText?.replaceAll(/<[^>]*>/g, "").trim();

      return {
        datetime: new Date(promo.createDate),
        id: String(promo.nodeId),
        imageURL: imageUrl,
        link,
        text,
        title: promo.header || promo.name,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Promoções UCI Cinemas Portugal",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "UCI Cinemas - Promoções",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const baseHeaders = {
    accept: "application/json, text/plain, */*",
    "user-agent": USERAGENT,
  };

  let currentUrl = API_URL;
  const cookies: Array<string> = [];
  const maxRedirects = 10;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const requestHeaders = new Headers(baseHeaders);
    if (cookies.length > 0) {
      requestHeaders.set("cookie", cookies.join("; "));
    }

    const response = await fetch(currentUrl, {
      headers: requestHeaders,
      method: "GET",
      redirect: "manual",
    });

    // Collect set-cookie headers
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    for (const setCookie of setCookieHeaders) {
      const cookiePart = setCookie.split(";")[0];
      if (cookiePart && !cookies.includes(cookiePart)) {
        cookies.push(cookiePart);
      }
    }

    // Follow redirects that include a destination.
    const isRedirect = response.status >= 300 && response.status < 400;
    const location = isRedirect ? response.headers.get("location") : undefined;
    if (!location) {
      return parse(parseValibot(UciPromocoesPayloadSchema, await response.json()));
    }

    if (redirectCount === maxRedirects) {
      throw new Error(`Too many redirects while fetching ${API_URL}`);
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error(`Failed to fetch ${API_URL}`);
}
