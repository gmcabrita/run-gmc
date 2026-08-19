import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const BASE_URL = "https://www.ucicinemas.pt/promocoes/";
const API_URL =
  "https://www.ucicinemas.pt/api/omnia/v1/pageList?friendly=/promocoes/&properties=promotionImage&properties=header&properties=introText";
const IMAGE_BASE_URL = "https://www.ucicinemas.pt";

const UciPromocoesPayloadSchema = v.array(
  v.looseObject({
    name: v.string(),
    url: v.string(),
    nodeId: v.number(),
    createDate: v.string(),
    promotionImage: v.nullish(
      v.looseObject({ desktop: v.string() }),
    ),
    introText: v.nullish(v.string()),
    header: v.nullish(v.string()),
  }),
);

type UciPromocoesPayload = v.InferOutput<typeof UciPromocoesPayloadSchema>;

export function parse(json: UciPromocoesPayload): RSSData {
  const entries: RSSEntry[] = json
    .map((promo) => {
      const link = new URL(promo.url, BASE_URL).href;
      const imageUrl = promo.promotionImage?.desktop
        ? new URL(promo.promotionImage.desktop, IMAGE_BASE_URL).href
        : undefined;

      // Strip HTML tags from introText for the text field
      const text = promo.introText?.replace(/<[^>]*>/g, "").trim();

      return {
        id: String(promo.nodeId),
        link,
        title: promo.header || promo.name,
        text,
        datetime: new Date(promo.createDate),
        imageURL: imageUrl,
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "UCI Cinemas - Promoções",
    description: "Promoções UCI Cinemas Portugal",
    language: "pt",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const baseHeaders = {
    accept: "application/json, text/plain, */*",
    "user-agent": USERAGENT,
  };

  let currentUrl = API_URL;
  const cookies: string[] = [];
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
      return parse(v.parse(UciPromocoesPayloadSchema, await response.json()));
    }

    if (redirectCount === maxRedirects) {
      throw new Error(`Too many redirects while fetching ${API_URL}`);
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error(`Failed to fetch ${API_URL}`);
}
