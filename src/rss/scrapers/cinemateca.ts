import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.cinemateca.pt/Programacao.aspx";
const PT_WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

interface CinematecaEntry extends RSSEntry {
  infoBiblio: Array<string>;
  infoDate: string;
}

function normalizeWS(input: string): string {
  return input
    .replaceAll('\u00A0', " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function getPTWeekday(date: Date): string {
  return PT_WEEKDAYS[date.getDay()] ?? "";
}

function parseDateTimeStrCinemateca(dateTimeStr: string): Date {
  const [datePartRaw, timePartRaw = ""] = dateTimeStr.split(",");
  const dateStr = datePartRaw.replaceAll(/\D/g, "");
  const timeStr = timePartRaw.replaceAll(/\D/g, "").padStart(4, "0");
  return new Date(
    `${dateStr.slice(4, 8)}-${dateStr.slice(2, 4)}-${dateStr.slice(0, 2)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`,
  );
}

function* generateNextDates(count: number = 50): Generator<string> {
  const today = new Date();
  for (let i = 0; i < count; i++) {
    yield today.toISOString().split("T")[0];
    today.setDate(today.getDate() + 1);
  }
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<CinematecaEntry> = [];
  let infoTitleCount = 0;

  const rewriter = new HTMLRewriter()
    .on(".sectionLayoutProgramLeft a[href*='id=']", {
      element(el) {
        const href = el.getAttribute("href");
        if (!href) {return;}

        infoTitleCount = 0;
        const link = new URL(href, BASE_URL).href;
        entries.push({
          id: link,
          infoBiblio: [],
          infoDate: "",
          link,
          text: "",
          title: "",
        });
      },
    })
    .on(
      ".sectionLayoutProgramLeft a[href*='id='] .infoTitle, .sectionLayoutProgramLeft a[href*='id='] .infoTitleProg",
      {
        element() {
          infoTitleCount++;
        },
        text(text) {
          const lastEntry = entries.at(-1);
          // Only capture text from the first .infoTitle (original title)
          if (lastEntry && text.text && infoTitleCount === 1) {
            lastEntry.title = (lastEntry.title || "") + text.text;
          }
        },
      },
    )
    .on(".sectionLayoutProgramLeft a[href*='id='] .infoBiblio", {
      element() {
        const lastEntry = entries.at(-1);
        if (lastEntry) {
          lastEntry.infoBiblio.push("");
        }
      },
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text && lastEntry.infoBiblio.length > 0) {
          lastEntry.infoBiblio[lastEntry.infoBiblio.length - 1] += text.text;
        }
      },
    })
    .on(".sectionLayoutProgramLeft a[href*='id='] .infoDate", {
      text(text) {
        const lastEntry = entries.at(-1);
        if (lastEntry && text.text) {
          lastEntry.infoDate = (lastEntry.infoDate || "") + text.text;
        }
      },
    });

  const transformed = rewriter.transform(response);
  if (transformed.body) {
    await consume(transformed.body);
  }

  const rssEntries: Array<RSSEntry> = entries.map((entry) => {
    const infoBiblio = entry.infoBiblio.map(normalizeWS).filter(Boolean);
    const director = infoBiblio[1] ?? "";
    const extra = infoBiblio[0] ?? "";
    const extra2 = infoBiblio[2] ?? "";

    const infoDate = normalizeWS(entry.infoDate);
    const room = normalizeWS(infoDate.split("|")[1] ?? "");
    const dateTimeStr = normalizeWS(infoDate.split("|")[0] ?? "");
    const dateTime = parseDateTimeStrCinemateca(dateTimeStr);
    const weekday = getPTWeekday(dateTime);

    const title = normalizeWS(entry.title);
    const fullTitle = director ? `${title}, ${director}` : title;
    const letterboxd = `https://letterboxd.com/search/films/${encodeURIComponent(title)}/?adult`;
    const text = `${weekday}, ${dateTimeStr}<br>${extra}<br>${extra2}<br>${room}<br><a href="${letterboxd}">Letterboxd Search</a>`;

    return {
      datetime: dateTime,
      id: entry.id,
      link: entry.link,
      text,
      title: fullTitle,
    };
  });

  return {
    description: "Programação da Cinemateca",
    entries: rssEntries.filter(isValidRSSEntry),
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Programação Cinemateca",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const scrapeUrls = Array.from(generateNextDates()).map((date) => `${BASE_URL}?date=${date}`);
  const allEntries: Array<RSSEntry> = [];

  const MAX_IN_FLIGHT = 10;
  for (let i = 0; i < scrapeUrls.length; i += MAX_IN_FLIGHT) {
    const batch = scrapeUrls.slice(i, i + MAX_IN_FLIGHT);
    const results = await Promise.all(
      batch.map(async (url) => {
        const response = await fetch(url, {
          headers: { "user-agent": USERAGENT },
        });

        try {
          return await parse(response);
        } catch (error) {
          try {
            await response.body?.cancel();
          } catch {
            // ignore
          }
          throw error;
        }
      }),
    );

    for (const result of results) {
      allEntries.push(...result.entries);
    }
  }

  return {
    description: "Programação da Cinemateca",
    entries: allEntries,
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Programação Cinemateca",
  };
}
