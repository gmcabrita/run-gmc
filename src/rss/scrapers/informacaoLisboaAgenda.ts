import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import { createProxiedFetch } from "../../proxiedFetch";
import type { RSSData, RSSEntry } from "@rss/types";
import * as v from "valibot";

const BASE_URL = "https://informacao.lisboa.pt";
const API_URL =
  "https://informacao.lisboa.pt/agenda?extensao=sfeventmgt&ambito=filter_sem_paginacao&pid=25&lang=0&cat_pai=19&offset=0";

const DateValueSchema = v.object({ date: v.string() });
const InformacaoLisboaAgendaPayloadSchema = v.array(
  v.looseObject({
    uid: v.number(),
    slug: v.string(),
    title: v.string(),
    categories: v.array(v.looseObject({ title: v.string() })),
    startdate: v.nullish(DateValueSchema),
    enddate: v.nullish(DateValueSchema),
  }),
);

type InformacaoLisboaAgendaPayload = v.InferOutput<
  typeof InformacaoLisboaAgendaPayloadSchema
>;

export async function parse(json: InformacaoLisboaAgendaPayload): Promise<RSSData> {
  const entries: RSSEntry[] = json
    .map((item) => {
      const link = `${BASE_URL}/agenda/o-que-fazer/${item.slug}/`;
      const text = `<strong>Categorias:</strong> ${item.categories.map((c) => c.title).join(", ")}<br>${item.title}<br>De ${item.startdate?.date} a ${item.enddate?.date}`;

      return {
        id: String(item.uid),
        link,
        title: item.title,
        text,
        datetime: new Date(item.startdate?.date ?? new Date()),
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Informação Lisboa Agenda",
    description: "Informação Lisboa Agenda",
    language: "pt",
    entries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(_ctx.env)(API_URL, {
    headers: {
      accept: "application/json",
    },
  });

  const json = v.parse(InformacaoLisboaAgendaPayloadSchema, await response.json());
  return parse(json);
}
