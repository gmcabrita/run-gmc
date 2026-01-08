import { USERAGENT, isValidRSSEntry, consume, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.cinemateca.pt/Programacao.aspx";

interface CinematecaEntry extends RSSEntry {
  infoBiblio: string[];
  infoDate: string;
}

function parseDateTimeStrCinemateca(dateTimeStr: string): Date {
  const dateStr = dateTimeStr.split(",")[0].trim().replaceAll("/", "");
  const timeStr = dateTimeStr.split(",")[1]?.trim().replaceAll("h", "") ?? "";
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
  let currentHref = "";
  let infoTitleCount = 0;

  const rewriter = new HTMLRewriter()
    .on("a[href^='?id=']", {
      element(el) {
        currentHref = el.getAttribute("href") ?? "";
      },
    })
    .on("a[href^='?id='] .w315", {
      element() {
        infoTitleCount = 0;
        entries.push({
          id: `${BASE_URL}${currentHref}`,
          link: `${BASE_URL}${currentHref}`,
          title: "",
          text: "",
          infoBiblio: [],
          infoDate: "",
        });
      },
    })
    .on("a[href^='?id='] .w315 .infoTitle", {
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
    })
    .on("a[href^='?id='] .w315 .infoBiblio", {
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
    .on("a[href^='?id='] .w315 .infoDate", {
      text(text) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && text.text) {
          lastEntry.infoDate = (lastEntry.infoDate || "") + text.text;
        }
      },
    });

  await consume(rewriter.transform(response).body!);

  const rssEntries: RSSEntry[] = entries.map((entry) => {
    const director = entry.infoBiblio[1] ?? "";
    const extra = entry.infoBiblio[0] ?? "";
    const extra2 = entry.infoBiblio[2] ?? "";
    const room = entry.infoDate.split("|")[1]?.trim() ?? "";
    const dateTimeStr = entry.infoDate.split("|")[0]?.trim() ?? "";
    const dateTime = parseDateTimeStrCinemateca(dateTimeStr);
    const fullTitle = `${entry.title}, ${director}`;
    const text = `${dateTimeStr}<br>${extra}<br>${extra2}<br>${room}<br>Letterboxd: https://letterboxd.com/search/${encodeURIComponent(entry.title)}/?adult`;

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

  const responses = await Promise.all(
    scrapeUrls.map((url) =>
      fetch(url, {
        headers: { "user-agent": USERAGENT },
      }),
    ),
  );

  const allEntries: RSSEntry[] = [];
  for (const response of responses) {
    const result = await parse(response);
    allEntries.push(...result.entries);
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
