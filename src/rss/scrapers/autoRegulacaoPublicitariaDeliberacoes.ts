import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://auto-regulacaopublicitaria.pt/deliberacoes/";
const BASE_ORIGIN = "https://auto-regulacaopublicitaria.pt";

const PORTUGUESE_MONTHS = new Map([
  ["janeiro", 1],
  ["fevereiro", 2],
  ["março", 3],
  ["marco", 3],
  ["abril", 4],
  ["maio", 5],
  ["junho", 6],
  ["julho", 7],
  ["agosto", 8],
  ["setembro", 9],
  ["outubro", 10],
  ["novembro", 11],
  ["dezembro", 12],
]);

interface AutoRegulacaoPublicitariaDraftEntry extends RSSEntry {
  year: string;
  date: string;
}

const NAMED_HTML_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", "\""],
]);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (entity, decimal) => {
      const codePoint = Number(decimal);
      if (!Number.isInteger(codePoint) || codePoint < 0) {
        return entity;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    })
    .replace(/&#x([\da-f]+);/gi, (entity, hexadecimal) => {
      const codePoint = Number.parseInt(hexadecimal, 16);
      if (!Number.isInteger(codePoint) || codePoint < 0) {
        return entity;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    })
    .replace(
      /&([a-z]+);/gi,
      (entity, name) => NAMED_HTML_ENTITIES.get(name.toLocaleLowerCase("en-US")) ?? entity,
    );
}

function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function parsePortugueseDate(value: string): Date | undefined {
  const match = normalizeWhitespace(value).match(/^(\p{L}+)\s+(\d{1,2}),\s+(\d{4})$/u);

  if (!match) {
    return undefined;
  }

  const [, monthName, dayString, yearString] = match;
  const month = PORTUGUESE_MONTHS.get(monthName.toLocaleLowerCase("pt-PT"));
  const day = Number(dayString);
  const year = Number(yearString);

  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: AutoRegulacaoPublicitariaDraftEntry[] = [];

  const rewriter = new HTMLRewriter()
    .on(".post_content .sc_blogger_item", {
      element() {
        entries.push({
          id: "",
          link: "",
          title: "",
          text: "",
          year: "",
          date: "",
        });
      },
    })
    .on(".post_content .sc_blogger_item .post_categories a", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.year += text.text;
        }
      },
    })
    .on(".post_content .sc_blogger_item .post_date", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.date += text.text;
        }
      },
    })
    .on(".post_content .sc_blogger_item .sc_blogger_item_title a", {
      element(el) {
        const lastEntry = entries[entries.length - 1];
        const href = el.getAttribute("href");
        if (lastEntry && href) {
          const link = new URL(href, BASE_ORIGIN).href;
          lastEntry.id = link;
          lastEntry.link = link;
        }
      },
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.title += text.text;
        }
      },
    });

  const transformed = rewriter.transform(response);
  if (!transformed.body) {
    throw new Error("Missing response body");
  }
  await consume(transformed.body);

  const rssEntries = entries
    .map((entry) => {
      const title = normalizeWhitespace(entry.title);
      const year = normalizeWhitespace(entry.year);
      const date = normalizeWhitespace(entry.date);
      const text = [year ? `Ano: ${year}` : "", date ? `Data: ${date}` : ""]
        .filter((part) => part.length > 0)
        .join(" | ");

      return {
        id: entry.id,
        link: entry.link,
        title,
        text: text || title,
        datetime: parsePortugueseDate(date),
      };
    })
    .filter((entry: RSSEntry) => isValidRSSEntry(entry));

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Deliberações ARP",
    description: "Deliberações da Auto Regulação Publicitária",
    language: "pt",
    entries: rssEntries,
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
      accept: "text/html",
    },
  });

  return parse(response);
}
