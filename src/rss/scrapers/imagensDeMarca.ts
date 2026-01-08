import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { ImagensDeMarcaResponse } from "@types";

const BASE_URL = "https://www.imagensdemarca.pt/";
const API_URL = "https://repeater.bondlayer.com/fetch";

export async function parse(json: ImagensDeMarcaResponse): Promise<RSSData> {
  const now = new Date();
  const entries: RSSEntry[] = json.items
    .filter((post) => post.datetime_cB1vB7YcXz && new Date(post.datetime_cB1vB7YcXz) < now)
    .map((post) => {
      const link = new URL(`artigo/${post._slug.all}`, BASE_URL).href;
      const imageUrl = (post.image_cHyPyUtO1f || post.image_cSyfYQnEab || post.image_crJeRfSWfz)
        ?.all;

      return {
        id: post.id,
        link,
        title: post._title.all,
        text: post._title.all,
        datetime: new Date(post.datetime_cB1vB7YcXz!),
        imageURL: imageUrl && imageUrl !== "" ? imageUrl : undefined,
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Imagens de Marca",
    description: "Imagens de Marca News",
    language: "pt",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locale: "pt",
      target: "production",
      repeater: {
        pagination: {
          enabled: true,
          marginPagesDisplayed: 0,
          pageRangeDisplayed: 6,
          perPage: "100",
        },
        limit: { enabled: false, start: "0", end: "" },
        filters: [],
        collection: "cS1WZNnN6W",
        userSorts: {
          attr: "datetime_cB1vB7YcXz",
          direction: "desc",
          origin: "filters",
        },
        page: 1,
      },
      projectId: "nb1nraet4m",
    }),
  });

  const json = (await response.json()) as ImagensDeMarcaResponse;
  return parse(json);
}
