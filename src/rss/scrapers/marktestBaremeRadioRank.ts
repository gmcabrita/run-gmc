import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import {
  array,
  looseObject,
  parse as parseValibot,
  record,
  string,
  type InferOutput,
} from "valibot";

const PAGE_URL = "https://www.marktest.com/BaremeRadioRank/";
// The page loads its data from this file. It is JSON with an .svg extension.
const DATA_URL = "https://www.marktest.com/BaremeRadioRank/BR_Rank_dados.svg";

const RankRowSchema = looseObject({
  aud: string(),
  emissora: string(),
  reach: string(),
  share: string(),
});

// Keys are wave ("vaga") names such as "Setembro 2026 (Mai-Set)", oldest first.
export const BaremeRadioRankPayloadSchema = record(
  string(),
  looseObject({
    descricao: string(),
    radios: array(RankRowSchema),
    redes: array(RankRowSchema),
  }),
);

type BaremeRadioRankPayload = InferOutput<typeof BaremeRadioRankPayloadSchema>;
type RankRow = InferOutput<typeof RankRowSchema>;

const PORTUGUESE_MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// The page shows these rows after the ranked stations, in this order.
const SUMMARY_ROW_NAMES = ["outras estações", "não sabe estação/posto", "total rádio"];

// "Setembro 2026 (Mai-Set)" -> 2026-09-01 UTC. The wave name is the only date in the data.
export function parseWaveDate(wave: string): Date | undefined {
  const match = wave.trim().match(/^(\p{L}+)\s+(\d{4})/u);
  if (!match) {
    return undefined;
  }
  const monthIndex = PORTUGUESE_MONTHS.indexOf(match[1].toLowerCase());
  if (monthIndex === -1) {
    return undefined;
  }
  return new Date(Date.UTC(Number(match[2]), monthIndex, 1));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reachValue(row: RankRow): number {
  const value = Number.parseFloat(row.reach.replace(",", "."));
  return Number.isNaN(value) ? 0 : value;
}

// Matches the page: ranked rows by weekly reach (highest first), then summary rows.
function sortRows(rows: Array<RankRow>): Array<RankRow> {
  const summaryIndex = (row: RankRow) =>
    SUMMARY_ROW_NAMES.indexOf(row.emissora.trim().toLowerCase());
  const ranked = rows
    .filter((row) => summaryIndex(row) === -1)
    .toSorted((a, b) => reachValue(b) - reachValue(a));
  const summary = rows
    .filter((row) => summaryIndex(row) !== -1)
    .toSorted((a, b) => summaryIndex(a) - summaryIndex(b));
  return [...ranked, ...summary];
}

function renderTable(nameHeader: string, rows: Array<RankRow>): string {
  const header = `<tr><th>#</th><th>${nameHeader}</th><th>Reach Semanal (%)</th><th>Aud Acumulada Véspera (%)</th><th>Share Aud. (%)</th></tr>`;
  let position = 0;
  const body = sortRows(rows)
    .map((row) => {
      const isSummary = SUMMARY_ROW_NAMES.includes(row.emissora.trim().toLowerCase());
      const rank = isSummary ? "-" : String(++position);
      return `<tr><td>${rank}</td><td>${escapeHtml(row.emissora)}</td><td>${escapeHtml(row.reach)}</td><td>${escapeHtml(row.aud)}</td><td>${escapeHtml(row.share)}</td></tr>`;
    })
    .join("");
  return `<table>${header}${body}</table>`;
}

export function parse(json: BaremeRadioRankPayload): RSSData {
  const entries: Array<RSSEntry> = Object.entries(json)
    .toReversed()
    .map(([wave, data]) => {
      // The page has no URL for a single wave, so the fragment only keeps links unique.
      const link = `${PAGE_URL}#${encodeURIComponent(wave)}`;
      const title = `Bareme Rádio RANK - ${data.descricao.trim() || wave}`;
      const text = [
        "<h3>Ranking de Rádios</h3>",
        renderTable("Estação", data.radios),
        "<h3>Ranking de Grupos</h3>",
        renderTable("Grupo", data.redes),
      ].join("");

      return { datetime: parseWaveDate(wave), id: link, link, text, title };
    })
    .filter(isValidRSSEntry);

  return {
    description: "Ranking Nacional de Audiências de Rádio",
    entries,
    id: PAGE_URL,
    language: "pt",
    link: PAGE_URL,
    title: "Marktest Bareme Rádio RANK",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(DATA_URL, {
    headers: { "User-Agent": USERAGENT },
  });
  if (!response.ok) {
    throw new Error(`Bareme Rádio RANK data request failed with HTTP ${response.status}`);
  }

  return parse(parseValibot(BaremeRadioRankPayloadSchema, await response.json()));
}
