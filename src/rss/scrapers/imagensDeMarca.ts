import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  parse as parseValibot,
  string,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://www.imagensdemarca.pt/";
const API_URL = "https://repeater.bondlayer.com/fetch";

const ImageValueSchema = looseObject({ all: string() });
const ImagensDeMarcaPayloadSchema = looseObject({
  items: array(
    looseObject({
      _slug: looseObject({ all: string() }),
      _title: looseObject({ all: string() }),
      datetime_cB1vB7YcXz: nullish(string()),
      id: string(),
      image_cHyPyUtO1f: nullish(ImageValueSchema),
      image_crJeRfSWfz: nullish(ImageValueSchema),
      image_cSyfYQnEab: nullish(ImageValueSchema),
    }),
  ),
});

type ImagensDeMarcaPayload = InferOutput<typeof ImagensDeMarcaPayloadSchema>;

export async function parse(json: ImagensDeMarcaPayload): Promise<RSSData> {
  const now = new Date();
  const entries: Array<RSSEntry> = json.items
    .flatMap((post) => {
      const publishedAt = post.datetime_cB1vB7YcXz;
      if (!publishedAt) {
        return [];
      }

      const publishedDate = new Date(publishedAt);
      if (Number.isNaN(publishedDate.getTime()) || publishedDate >= now) {
        return [];
      }

      const link = new URL(`artigo/${post._slug.all}`, BASE_URL).href;
      const imageUrl = (post.image_cHyPyUtO1f || post.image_cSyfYQnEab || post.image_crJeRfSWfz)
        ?.all;

      return [
        {
          datetime: publishedDate,
          id: post.id,
          imageURL: imageUrl && imageUrl !== "" ? imageUrl : undefined,
          link,
          text: post._title.all,
          title: post._title.all,
        },
      ];
    })
    .filter(isValidRSSEntry);

  return {
    description: "Imagens de Marca News",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Imagens de Marca",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(API_URL, {
    body: JSON.stringify({
      locale: "pt",
      projectId: "nb1nraet4m",
      repeater: {
        collection: "cS1WZNnN6W",
        filters: [],
        limit: { enabled: false, end: "", start: "0" },
        page: 1,
        pagination: {
          enabled: true,
          marginPagesDisplayed: 0,
          pageRangeDisplayed: 6,
          perPage: "100",
        },
        userSorts: {
          attr: "datetime_cB1vB7YcXz",
          direction: "desc",
          origin: "filters",
        },
      },
      target: "production",
    }),
    headers: {
      "Content-Type": "application/json",
      "user-agent": USERAGENT,
    },
    method: "POST",
  });

  const json = parseValibot(ImagensDeMarcaPayloadSchema, await response.json());
  return parse(json);
}
