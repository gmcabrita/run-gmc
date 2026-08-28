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

const BASE_URL = "https://lbbonline.com/news?edition=international";
const API_URL = "https://search.lbbonline.com/indexes/lbb_news/search";
const IMAGE_BASE_URL = "https://d3q27bh1u24u2o.cloudfront.net";

const LbbOnlinePayloadSchema = looseObject({
  hits: array(
    looseObject({
      date: string(),
      description: string(),
      id: pipe(
        union([string(), number()]),
        transform(String),
      ),
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
  const entries: Array<RSSEntry> = json.hits
    .filter((post) => new Date(post.date) < now)
    .map((post) => {
      const link = new URL(`news/${post.slug}`, BASE_URL).href;
      const imageUrl = post.image ? new URL(post.image, IMAGE_BASE_URL).href : undefined;

      return {
        datetime: new Date(post.date),
        id: post.id,
        imageURL: imageUrl,
        link,
        text: post.description,
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

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    body: JSON.stringify({
      limit: 150,
      offset: 0,
      q: "",
      sort: ["date:desc"],
    }),
    headers: {
      "user-agent": USERAGENT,
      // If this Bearer token stops working we can always:
      // - Fetch the baseUrl -> Find the relevant .js -> Find the Bearer token inside the .js
      Authorization: "Bearer 0282cf3b4b18a23017eb4e2a7dabd69092783b710ea98f926a5bc1bf02e10b67",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return parse(await response.json());
}
