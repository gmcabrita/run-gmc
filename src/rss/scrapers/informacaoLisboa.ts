import { isValidRSSEntry, type ScraperContext } from "@rss/common";
import { createProxiedFetch } from "../../proxiedFetch";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  nullish,
  number,
  parse as parseValibot,
  string,
  type InferOutput,
} from "valibot";

const BASE_URL = "https://informacao.lisboa.pt";
const API_URL =
  "https://informacao.lisboa.pt/noticias?extensao=news&ambito=news_filter&pid=6&lang=0&offset=0";

const InformacaoLisboaPayloadSchema = looseObject({
  registos: array(
    looseObject({
      categorias: nullish(array(looseObject({ nome: string() }))),
      data: string(),
      hora: string(),
      noticia: string(),
      titulo: string(),
      uid: number(),
      url: string(),
    }),
  ),
});

type InformacaoLisboaPayload = InferOutput<typeof InformacaoLisboaPayloadSchema>;

function parseDateTimeInformacaoLisboa(dateStr: string): Date {
  const months = new Map([
    ["jan", 0],
    ["fev", 1],
    ["mar", 2],
    ["abr", 3],
    ["mai", 4],
    ["jun", 5],
    ["jul", 6],
    ["ago", 7],
    ["set", 8],
    ["out", 9],
    ["nov", 10],
    ["dez", 11],
  ]);

  const match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4}),?\s*(\d{1,2})h(\d{2})/i);

  if (!match) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  const [, day, month, year, hour, minute] = match;
  const monthIndex = months.get(month.toLowerCase());

  if (monthIndex === undefined) {
    throw new Error(`Invalid month abbreviation: ${dateStr}`);
  }

  return new Date(Number(year), monthIndex, Number(day), Number(hour), Number(minute));
}

export async function parse(json: InformacaoLisboaPayload): Promise<RSSData> {
  const entries: Array<RSSEntry> = json.registos
    .map((item) => {
      const link = `${BASE_URL}/noticias/detalhe/${item.url}`;
      const text = `<strong>Categorias:</strong> ${(item.categorias ?? []).map((c) => c.nome).join(", ")}<br>${item.noticia}`;

      return {
        datetime: parseDateTimeInformacaoLisboa(`${item.data}, ${item.hora}`),
        id: String(item.uid),
        link,
        text,
        title: item.titulo,
      };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Informação Lisboa",
    entries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Informação Lisboa",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(_ctx.env)(API_URL, {
    headers: {
      accept: "application/json",
    },
  });

  const json = parseValibot(InformacaoLisboaPayloadSchema, await response.json());
  return parse(json);
}
