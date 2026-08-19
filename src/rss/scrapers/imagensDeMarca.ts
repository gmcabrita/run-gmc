import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const BASE_URL = "https://www.imagensdemarca.pt/";
const API_URL = "https://repeater.bondlayer.com/fetch";

const ImageValueSchema = v.looseObject({ all: v.string() });
const ImagensDeMarcaPayloadSchema = v.looseObject({
  items: v.array(
    v.looseObject({
      id: v.string(),
      _title: v.looseObject({ all: v.string() }),
      _slug: v.looseObject({ all: v.string() }),
      image_cHyPyUtO1f: v.nullish(ImageValueSchema),
      image_cSyfYQnEab: v.nullish(ImageValueSchema),
      image_crJeRfSWfz: v.nullish(ImageValueSchema),
      datetime_cB1vB7YcXz: v.nullish(v.string()),
    }),
  ),
});

type ImagensDeMarcaPayload = v.InferOutput<typeof ImagensDeMarcaPayloadSchema>;

export async function parse(json: ImagensDeMarcaPayload): Promise<RSSData> {
  const now = new Date();
  const entries: RSSEntry[] = json.items
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
          id: post.id,
          link,
          title: post._title.all,
          text: post._title.all,
          datetime: publishedDate,
          imageURL: imageUrl && imageUrl !== "" ? imageUrl : undefined,
        },
      ];
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

  const json = v.parse(ImagensDeMarcaPayloadSchema, await response.json());
  return parse(json);
}
