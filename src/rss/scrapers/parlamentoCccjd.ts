import { USERAGENT, consume, decodeHtmlEntities, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import { createProxiedFetch } from "../../proxiedFetch";

const PAGE_URL = "https://www.parlamento.pt/sites/COM/XVIILeg/12CCCJD/Paginas/Default.aspx";
const SECTIONS = new Map([
  ["Agendas", "Agenda"],
  ["Audicoes", "Audição"],
  ["Audiencias", "Audiência"],
  ["Iniciativas", "Iniciativa"],
  ["Peticoes", "Petição"],
]);

interface ParlamentoField {
  href: string;
  label: string;
  value: string;
}

interface ParlamentoRow {
  category: string;
  fields: Array<ParlamentoField>;
}

function normalizeParlamentoText(value: string): string {
  return decodeHtmlEntities(value).replaceAll(/\s+/g, " ").trim();
}

function escapeParlamentoHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parseParlamentoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : undefined;
}

function createParlamentoEntry(row: ParlamentoRow): RSSEntry | undefined {
  const fields = row.fields.map((field) => ({
    ...field,
    href: decodeHtmlEntities(field.href).trim(),
    label: normalizeParlamentoText(field.label),
    value: normalizeParlamentoText(field.value),
  }));
  const subject = fields.find((field) => ["Agenda", "Assunto", "Título"].includes(field.label));
  if (!subject?.value || !subject.href || !URL.canParse(subject.href, PAGE_URL)) {
    return undefined;
  }
  const url = new URL(subject.href, PAGE_URL);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return undefined;
  }

  // Agenda PDF links contain an encrypted Path that can change between requests.
  const agendaNumber = row.category === "Agenda" ? subject.value.match(/^\d+/)?.[0] : undefined;
  const date = fields.find((field) => ["Data", "D.Estado"].includes(field.label));
  return {
    datetime: date ? parseParlamentoDate(date.value) : undefined,
    id: agendaNumber ? `${PAGE_URL}#agenda-${agendaNumber}` : url.href,
    link: url.href,
    text: fields
      .filter((field) => field.label && field.value)
      .map(
        (field) =>
          `<strong>${escapeParlamentoHtml(field.label)}:</strong> ${escapeParlamentoHtml(field.value)}`,
      )
      .join("<br>"),
    title: `${row.category}: ${subject.value}`,
  };
}

/** Parses Parliament CCCJD activity; source dates use UTC midnight and times stay in the text. */
export async function parseParlamentoCccjd(response: Response): Promise<RSSData> {
  const rows: Array<ParlamentoRow> = [];
  const rewriter = new HTMLRewriter();

  for (const [section, category] of SECTIONS) {
    const rowSelector = `#${section} .row.margin-Top-15`;
    let currentRow: ParlamentoRow | undefined;
    let currentField: ParlamentoField | undefined;
    rewriter
      .on(rowSelector, {
        element(element) {
          currentRow = { category, fields: [] };
          rows.push(currentRow);
          element.onEndTag(() => {
            currentRow = undefined;
            currentField = undefined;
          });
        },
      })
      .on(`${rowSelector} > div`, {
        element(element) {
          currentField = { href: "", label: "", value: "" };
          currentRow?.fields.push(currentField);
          element.onEndTag(() => {
            currentField = undefined;
          });
        },
      })
      .on(`${rowSelector} > div > .TextoRegular-Titulo`, {
        text(text) {
          if (currentField) {
            currentField.label += text.text;
          }
        },
      })
      .on(`${rowSelector} > div > .TextoRegular`, {
        element(element) {
          if (currentField) {
            currentField.href = element.getAttribute("href") ?? "";
          }
        },
        text(text) {
          if (currentField) {
            currentField.value += text.text;
          }
        },
      });
  }

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Parlamento CCCJD response body is missing");
  }
  await consume(body);

  const entries = new Map<string, RSSEntry>();
  for (const row of rows) {
    const entry = createParlamentoEntry(row);
    if (entry && !entries.has(entry.id)) {
      entries.set(entry.id, entry);
    }
  }

  return {
    description: "Agendas, audições, audiências, iniciativas e petições da XVII Legislatura.",
    entries: [...entries.values()].sort(
      (first, second) => (second.datetime?.getTime() ?? 0) - (first.datetime?.getTime() ?? 0),
    ),
    id: PAGE_URL,
    language: "pt",
    link: PAGE_URL,
    title: "Parlamento – Comissão de Cultura, Comunicação, Juventude e Desporto",
  };
}

/** Fetches the Parliament CCCJD homepage through the HTTP relay; direct Worker requests fail. */
export async function getParlamentoCccjd(ctx: ScraperContext): Promise<RSSData> {
  const response = await createProxiedFetch(ctx.env)(PAGE_URL, {
    headers: { accept: "text/html", "user-agent": USERAGENT },
  });
  if (!response.ok) {
    throw new Error(`Parlamento CCCJD request failed: ${response.status}`);
  }
  return parseParlamentoCccjd(response);
}
