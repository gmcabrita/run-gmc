import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  number,
  parse as parseValibot,
  pipe,
  string,
  transform,
  union,
  type InferInput,
} from "valibot";
import { createProxiedFetch } from "../../proxiedFetch";

const BASE_URL = "https://lbbonline.com/news?edition=international";
// `limit=48` is the page size that the lbbonline.com news page uses.
const API_URL = "https://lbbonline.com/api/news?edition=international&limit=48&sort=latest";
const IMAGE_BASE_URL = "https://d3q27bh1u24u2o.cloudfront.net";

const LbbOnlinePayloadSchema = looseObject({
  items: array(
    looseObject({
      date: string(),
      id: pipe(union([string(), number()]), transform(String)),
      image: nullish(string()),
      slug: string(),
      title: string(),
    }),
  ),
});

type LbbOnlinePayload = InferInput<typeof LbbOnlinePayloadSchema>;

export async function parse(payload: LbbOnlinePayload): Promise<RSSData> {
  const json = parseValibot(LbbOnlinePayloadSchema, payload);
  const now = new Date();
  const entries: Array<RSSEntry> = json.items
    .filter((post) => new Date(post.date) < now)
    .map((post) => {
      const link = new URL(`news/${post.slug}`, BASE_URL).href;
      const imageUrl = post.image ? new URL(post.image, IMAGE_BASE_URL).href : undefined;

      return {
        datetime: new Date(post.date),
        id: post.id,
        imageURL: imageUrl,
        link,
        title: post.title,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Little Black Book",
    entries,
    id: BASE_URL,
    language: "en",
    link: BASE_URL,
    title: "Little Black Book",
  };
}

// lbbonline.com sits behind a Cloudflare challenge. Direct requests get a 403.
// The relay passes the challenge when the request has a browser User-Agent.
export async function get(ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(ctx.env)(API_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": USERAGENT,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`LBB request failed: ${response.status}`);
  }

  return parse(await response.json());
}
