import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.cinemateca.pt/Programacao.aspx";

interface CinematecaEntry extends RSSEntry {
  infoBiblio: string[];
  infoDate: string;
}

function normalizeWS(input: string): string {
  return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function parseDateTimeStrCinemateca(dateTimeStr: string): Date {
  const [datePartRaw, timePartRaw = ""] = dateTimeStr.split(",");
  const dateStr = datePartRaw.replace(/\D/g, "");
  const timeStr = timePartRaw.replace(/\D/g, "").padStart(4, "0");
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
  const entries: CinematecaEntry[] = [];
  let infoTitleCount = 0;

  const rewriter = new HTMLRewriter()
    .on(".sectionLayoutProgramLeft a[href*='id=']", {
      element(el) {
        const href = el.getAttribute("href");
        if (!href) return;

        infoTitleCount = 0;
        const link = new URL(href, BASE_URL).href;
        entries.push({
          id: link,
          link,
          title: "",
          text: "",
          infoBiblio: [],
          infoDate: "",
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
          const lastEntry = entries[entries.length - 1];
          // Only capture text from the first .infoTitle (original title)
          if (lastEntry && text.text && infoTitleCount === 1) {
            lastEntry.title = (lastEntry.title || "") + text.text;
          }
        },
      },
    )
    .on(".sectionLayoutProgramLeft a[href*='id='] .infoBiblio", {
      element() {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          lastEntry.infoBiblio.push("");
        }
      },
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text && lastEntry.infoBiblio.length > 0) {
          lastEntry.infoBiblio[lastEntry.infoBiblio.length - 1] += text.text;
        }
      },
    })
    .on(".sectionLayoutProgramLeft a[href*='id='] .infoDate", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.infoDate = (lastEntry.infoDate || "") + text.text;
        }
      },
    });

  const transformed = rewriter.transform(response);
  if (transformed.body) {
    await consume(transformed.body);
  }

  const rssEntries: RSSEntry[] = entries.map((entry) => {
    const infoBiblio = entry.infoBiblio.map(normalizeWS).filter(Boolean);
    const director = infoBiblio[1] ?? "";
    const extra = infoBiblio[0] ?? "";
    const extra2 = infoBiblio[2] ?? "";

    const infoDate = normalizeWS(entry.infoDate);
    const room = normalizeWS(infoDate.split("|")[1] ?? "");
    const dateTimeStr = normalizeWS(infoDate.split("|")[0] ?? "");
    const dateTime = parseDateTimeStrCinemateca(dateTimeStr);

    const title = normalizeWS(entry.title);
    const fullTitle = director ? `${title}, ${director}` : title;
    const letterboxd = `https://letterboxd.com/search/${encodeURIComponent(title)}/?adult`;
    const letterboxdDeeplinkApple = `letterboxd://x-callback-url/search?query=encodeURIComponent(title)&type=all`;
    const text = `${dateTimeStr}<br>${extra}<br>${extra2}<br>${room}<br><a href="${letterboxd}">Letterboxd</a><br><a href="${letterboxdDeeplinkApple}">Letterboxd iOS Deeplink</a>`;

    return {
      id: entry.id,
      link: entry.link,
      title: fullTitle,
      text,
      datetime: dateTime,
    };
  });

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Programação Cinemateca",
    description: "Programação da Cinemateca",
    language: "pt",
    entries: rssEntries.filter(isValidRSSEntry),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const scrapeUrls = Array.from(generateNextDates()).map((date) => `${BASE_URL}?date=${date}`);
  const allEntries: RSSEntry[] = [];

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
        } catch (err) {
          try {
            await response.body?.cancel();
          } catch {
            // ignore
          }
          throw err;
        }
      }),
    );

    for (const result of results) {
      allEntries.push(...result.entries);
    }
  }

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Programação Cinemateca",
    description: "Programação da Cinemateca",
    language: "pt",
    entries: allEntries,
  };
}
