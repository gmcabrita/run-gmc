import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import { createProxiedFetch } from "../../proxiedFetch";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  number,
  object,
  parse as parseValibot,
  string,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://informacao.lisboa.pt";
const API_URL =
  "https://informacao.lisboa.pt/agenda?extensao=sfeventmgt&ambito=filter_sem_paginacao&pid=25&lang=0&cat_pai=19&offset=0";

const DateValueSchema = object({ date: string() });
const InformacaoLisboaAgendaPayloadSchema = array(
  looseObject({
    categories: array(looseObject({ title: string() })),
    enddate: nullish(DateValueSchema),
    slug: string(),
    startdate: nullish(DateValueSchema),
    title: string(),
    uid: number(),
  }),
);

type InformacaoLisboaAgendaPayload = InferOutput<
  typeof InformacaoLisboaAgendaPayloadSchema
>;

export async function parse(json: InformacaoLisboaAgendaPayload): Promise<RSSData> {
  const entries: Array<RSSEntry> = json
    .map((item) => {
      const link = `${BASE_URL}/agenda/o-que-fazer/${item.slug}/`;
      const text = `<strong>Categorias:</strong> ${item.categories.map((c) => c.title).join(", ")}<br>${item.title}<br>De ${item.startdate?.date} a ${item.enddate?.date}`;

      return {
        datetime: new Date(item.startdate?.date ?? new Date()),
        id: String(item.uid),
        link,
        text,
        title: item.title,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Informação Lisboa Agenda",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Informação Lisboa Agenda",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(_ctx.env)(API_URL, {
    headers: {
      accept: "application/json",
    },
  });

  const json = parseValibot(InformacaoLisboaAgendaPayloadSchema, await response.json());
  return parse(json);
}
