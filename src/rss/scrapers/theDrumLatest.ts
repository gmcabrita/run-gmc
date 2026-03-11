import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.thedrum.com/latest";
const SITE_ORIGIN = "https://www.thedrum.com";
const RELEASE_MONTHS = new Map<string, number>([
  ["jan", 0],
  ["feb", 1],
  ["mar", 2],
  ["apr", 3],
  ["may", 4],
  ["jun", 5],
  ["jul", 6],
  ["aug", 7],
  ["sep", 8],
  ["oct", 9],
  ["nov", 10],
  ["dec", 11],
]);

interface TheDrumDraftEntry extends RSSEntry {
  releaseText: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toDurationMillis(count: number, unit: string): number | undefined {
  switch (unit) {
    case "minute":
    case "minutes":
      return count * 60 * 1000;
    case "hour":
    case "hours":
      return count * 60 * 60 * 1000;
    case "day":
    case "days":
      return count * 24 * 60 * 60 * 1000;
    case "week":
    case "weeks":
      return count * 7 * 24 * 60 * 60 * 1000;
    default:
      return undefined;
  }
}

export function parseReleaseDate(releaseText: string, now: Date = new Date()): Date | undefined {
  const normalized = normalizeWhitespace(releaseText).toLowerCase();
  if (normalized === "" || normalized === "new") {
    return undefined;
  }

  const relativeMatch = normalized.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\s+ago$/);
  if (relativeMatch) {
    const count = Number(relativeMatch[1]);
    const unit = relativeMatch[2];
    if (!Number.isFinite(count) || !unit) {
      return undefined;
    }

    const durationMillis = toDurationMillis(count, unit);
    if (durationMillis == null) {
      return undefined;
    }

    return new Date(now.getTime() - durationMillis);
  }

  const absoluteMatch = normalized.match(/^(\d{1,2})\s+([a-z]{3})\s+(\d{4})$/);
  if (!absoluteMatch) {
    return undefined;
  }

  const day = Number(absoluteMatch[1]);
  const monthIndex = RELEASE_MONTHS.get(absoluteMatch[2]);
  const year = Number(absoluteMatch[3]);
  if (!Number.isFinite(day) || monthIndex == null || !Number.isFinite(year)) {
    return undefined;
  }

  const parsed = new Date(Date.UTC(year, monthIndex, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

export async function parse(response: Response, now: Date = new Date()): Promise<RSSData> {
  const entries: TheDrumDraftEntry[] = [];
  let currentEntry: TheDrumDraftEntry | null = null;

  const rewriter = new HTMLRewriter()
    .on("section.hub__articles--latest .hub__articles-data", {
      element() {
        currentEntry = {
          id: "",
          link: "",
          title: "",
          text: "",
          releaseText: "",
        };
        entries.push(currentEntry);
      },
    })
    .on("section.hub__articles--latest .hub__articles-data a.hub-article__info-title", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const href = el.getAttribute("href");
        if (!href) {
          return;
        }

        const link = new URL(href, SITE_ORIGIN).toString();
        currentEntry.id = link;
        currentEntry.link = link;
      },
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.title += text.text;
      },
    })
    .on("section.hub__articles--latest .hub__articles-data .hub-article__info-time--release", {
      text(text) {
        if (!currentEntry) {
          return;
        }

        currentEntry.releaseText += text.text;
      },
    })
    .on("section.hub__articles--latest .hub__articles-data a.hub-article__img img", {
      element(el) {
        if (!currentEntry) {
          return;
        }

        const src = el.getAttribute("src");
        if (!src) {
          return;
        }

        currentEntry.imageURL = new URL(src, SITE_ORIGIN).toString();
      },
    });

  const body = rewriter.transform(response).body;
  if (!body) {
    throw new Error("Missing response body");
  }
  await consume(body);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Latest Marketing News | The Drum",
    description:
      "Get the latest marketing news here at The Drum. Browse the latest industry and brand news as it happens, including in-depth journalism and analysis.",
    language: "en",
    entries: entries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        return {
          id: entry.id,
          link: entry.link,
          title,
          text: title,
          datetime: parseReleaseDate(entry.releaseText, now),
          imageURL: entry.imageURL,
        };
      })
      .filter(isValidRSSEntry),
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
