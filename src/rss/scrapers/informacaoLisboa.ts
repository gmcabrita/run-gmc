import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { InformacaoLisboaNoticiasResponse } from "@types";

const BASE_URL = "https://informacao.lisboa.pt";
const API_URL =
  "https://informacao.lisboa.pt/noticias?extensao=news&ambito=news_filter&pid=6&lang=0&offset=0";

function parseDateTimeInformacaoLisboa(dateStr: string): Date {
  const months: Record<string, number> = {
    jan: 0,
    fev: 1,
    mar: 2,
    abr: 3,
    mai: 4,
    jun: 5,
    jul: 6,
    ago: 7,
    set: 8,
    out: 9,
    nov: 10,
    dez: 11,
  };

  const match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4}),?\s*(\d{1,2})h(\d{2})/i);

  if (!match) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  const [, day, month, year, hour, minute] = match;
  const monthIndex = months[month.toLowerCase()];

  if (monthIndex === undefined) {
    throw new Error(`Invalid month abbreviation: ${dateStr}`);
  }

  return new Date(Number(year), monthIndex, Number(day), Number(hour), Number(minute));
}

export async function parse(json: InformacaoLisboaNoticiasResponse): Promise<RSSData> {
  const entries: RSSEntry[] = json.registos
    .map((item) => {
      const link = `${BASE_URL}/noticias/detalhe/${item.url}`;
      const text = `<strong>Categorias:</strong> ${(item.categorias ?? []).map((c) => c.nome).join(", ")}<br>${item.noticia}`;

      return {
        id: String(item.uid),
        link,
        title: item.titulo,
        text,
        datetime: parseDateTimeInformacaoLisboa(`${item.data}, ${item.hora}`),
      };
    })
    .filter(isValidRSSEntry);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Informação Lisboa",
    description: "Informação Lisboa",
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

  const json = (await response.json()) as InformacaoLisboaNoticiasResponse;
  return parse(json);
}
