import {
  USERAGENT,
  consume,
  decodeHtmlEntities,
  isValidRSSEntry,
  type ScraperContext,
} from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.clubedacriatividade.pt/lista-de-noticias/";
// The page sets `<base href>` to the site root, so card links resolve against it.
const BASE_ORIGIN = "https://www.clubedacriatividade.pt/";

// The listing shows the date as three blocks: day, short month name, year.
const PORTUGUESE_SHORT_MONTHS = new Map([
  ["jan", 1],
  ["fev", 2],
  ["mar", 3],
  ["abr", 4],
  ["mai", 5],
  ["jun", 6],
  ["jul", 7],
  ["ago", 8],
  ["set", 9],
  ["out", 10],
  ["nov", 11],
  ["dez", 12],
]);

// The site is built with Bondhabits. Its CSS class names are generated, so the
// selectors use the `data-bl-name` attributes that the site editor sets.
const CARD = 'a[data-bl-name="card2 news"]';

interface ClubeDaCriatividadeDraftEntry {
  dateParts: Array<string>;
  imageURL: string;
  link: string;
  text: string;
  title: string;
}

function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(value).replaceAll(/\s+/g, " ").trim();
}

export function parseCardDate([day, month, year]: Array<string>): Date | undefined {
  const monthNumber = PORTUGUESE_SHORT_MONTHS.get(month?.toLocaleLowerCase("pt-PT") ?? "");
  const dayNumber = Number(day);
  const yearNumber = Number(year);

  if (!monthNumber || !Number.isInteger(dayNumber) || !Number.isInteger(yearNumber)) {
    return undefined;
  }

  return new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<ClubeDaCriatividadeDraftEntry> = [];

  const rewriter = new HTMLRewriter()
    .on(CARD, {
      element(el) {
        const href = el.getAttribute("href");
        entries.push({
          dateParts: [],
          imageURL: "",
          link: href ? new URL(href, BASE_ORIGIN).href : "",
          text: "",
          title: "",
        });
      },
    })
    .on(`${CARD} [data-bl-name="tag"] .bl-text`, {
      element() {
        entries.at(-1)?.dateParts.push("");
      },
      text(text) {
        const dateParts = entries.at(-1)?.dateParts;
        if (dateParts && dateParts.length > 0) {
          dateParts[dateParts.length - 1] += text.text;
        }
      },
    })
    .on(`${CARD} img[data-src]`, {
      element(el) {
        const lastEntry = entries.at(-1);
        const src = el.getAttribute("data-src");
        if (lastEntry && src) {
          lastEntry.imageURL = decodeHtmlEntities(src);
        }
      },
    })
    .on(`${CARD} [data-bl-name="title"] .bl-text`, {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry) {
          lastEntry.title += text.text;
        }
      },
    })
    .on(`${CARD} [data-bl-name="lead"] .bl-text`, {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry) {
          lastEntry.text += text.text;
        }
      },
    });

  const transformed = rewriter.transform(response);
  if (!transformed.body) {
    throw new Error("Missing response body");
  }
  await consume(transformed.body);

  const rssEntries: Array<RSSEntry> = entries
    .map((entry) => ({
      datetime: parseCardDate(entry.dateParts.map(normalizeWhitespace)),
      id: entry.link,
      imageURL: entry.imageURL || undefined,
      link: entry.link,
      text: normalizeWhitespace(entry.text) || undefined,
      title: normalizeWhitespace(entry.title),
    }))
    .filter((entry) => isValidRSSEntry(entry));

  return {
    description: "Notícias do Clube da Criatividade de Portugal",
    entries: rssEntries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Clube da Criatividade - Notícias",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      accept: "text/html",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Clube da Criatividade request failed: ${response.status}`);
  }

  return parse(response);
}
