import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { UciPromocoesResponse } from "@types";

const BASE_URL = "https://www.ucicinemas.pt/promocoes/";
const API_URL =
  "https://www.ucicinemas.pt/api/omnia/v1/pageList?friendly=/promocoes/&properties=promotionImage&properties=header&properties=introText";
const IMAGE_BASE_URL = "https://www.ucicinemas.pt";

export function parse(json: UciPromocoesResponse): RSSData {
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
  let cookies: string[] = [];
  let response: Response;
  let redirectCount = 0;
  const maxRedirects = 10;

  while (redirectCount < maxRedirects) {
    const requestHeaders: Record<string, string> = { ...baseHeaders };
    if (cookies.length > 0) {
      requestHeaders["cookie"] = cookies.join("; ");
    }

    response = await fetch(currentUrl, {
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

    // Check if it's a redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        continue;
      }
    }

    break;
  }

  const json = (await response!.json()) as UciPromocoesResponse;
  return parse(json);
}
