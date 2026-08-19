import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const BASE_URL = "https://lbbonline.com/news?edition=international";
const API_URL = "https://search.lbbonline.com/indexes/lbb_news/search";
const IMAGE_BASE_URL = "https://d3q27bh1u24u2o.cloudfront.net";

const LbbOnlinePayloadSchema = v.looseObject({
  hits: v.array(
    v.looseObject({
      id: v.pipe(
        v.union([v.string(), v.number()]),
        v.transform((value) => String(value)),
      ),
      title: v.string(),
      slug: v.string(),
      description: v.string(),
      image: v.nullish(v.string()),
      date: v.string(),
    }),
  ),
});

type LbbOnlinePayload = v.InferInput<typeof LbbOnlinePayloadSchema>;

export async function parse(payload: LbbOnlinePayload): Promise<RSSData> {
  const json = v.parse(LbbOnlinePayloadSchema, payload);
  const now = new Date();
  const entries: RSSEntry[] = json.hits
    .filter((post) => new Date(post.date) < now)
    .map((post) => {
      const link = new URL(`news/${post.slug}`, BASE_URL).href;
      const imageUrl = post.image ? new URL(post.image, IMAGE_BASE_URL).href : undefined;

      return {
        id: post.id,
        link,
        title: post.title,
        text: post.description,
        datetime: new Date(post.date),
        imageURL: imageUrl,
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Little Black Book",
    description: "Little Black Book",
    language: "en",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "user-agent": USERAGENT,
      // If this Bearer token stops working we can always:
      // - Fetch the baseUrl -> Find the relevant .js -> Find the Bearer token inside the .js
      Authorization: "Bearer 0282cf3b4b18a23017eb4e2a7dabd69092783b710ea98f926a5bc1bf02e10b67",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: "",
      offset: 0,
      limit: 150,
      sort: ["date:desc"],
    }),
  });

  return parse(await response.json());
}
