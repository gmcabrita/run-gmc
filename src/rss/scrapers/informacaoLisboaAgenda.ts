import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { InformacaoLisboaAgendaItem } from "@types";

const BASE_URL = "https://informacao.lisboa.pt";
const API_URL =
  "https://informacao.lisboa.pt/agenda?extensao=sfeventmgt&ambito=filter_sem_paginacao&pid=25&lang=0&cat_pai=19&offset=0";

export async function parse(json: InformacaoLisboaAgendaItem[]): Promise<RSSData> {
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
  const response = await fetch(API_URL, {
    headers: {
      "user-agent": USERAGENT,
      accept: "application/json",
    },
  });

  const json = (await response.json()) as InformacaoLisboaAgendaItem[];
  return parse(json);
}
