import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const SITE_ORIGIN = "https://www.culturgest.pt";
const BASE_URL = new URL("/pt/programacao/por-evento/", SITE_ORIGIN).href;
const AJAX_URL = new URL("/pt/programacao/schedule/events/", SITE_ORIGIN).href;

const PT_MONTH_INDEX = new Map([
  ["jan", 0],
  ["janeiro", 0],
  ["fev", 1],
  ["fevereiro", 1],
  ["mar", 2],
  ["marco", 2],
  ["abr", 3],
  ["abril", 3],
  ["mai", 4],
  ["maio", 4],
  ["jun", 5],
  ["junho", 5],
  ["jul", 6],
  ["julho", 6],
  ["ago", 7],
  ["agosto", 7],
  ["set", 8],
  ["setembro", 8],
  ["out", 9],
  ["outubro", 9],
  ["nov", 10],
  ["novembro", 10],
  ["dez", 11],
  ["dezembro", 11],
]);

type FetchFn = typeof fetch;

type DraftEvent = {
  link: string;
  title: string;
  subtitle: string;
  fallbackTitle: string;
  dateLabel: string;
  types: string[];
  tags: string[];
  imageURL?: string;
  datetime?: Date;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeToken(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "");
}

function normalizeDateLabel(value: string): string {
  return normalizeWhitespace(value).replace(/\s*([\u2013\u2014-])\s*/g, " $1 ");
}

function getLastEvent(events: DraftEvent[]): DraftEvent | undefined {
  return events[events.length - 1];
}

function pushUnique(values: string[], value: string): void {
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0 || values.includes(normalized)) {
    return;
  }

  values.push(normalized);
}

function toAbsoluteUrl(value: string): string {
  return new URL(value, SITE_ORIGIN).href;
}

function normalizeEventLink(href: string): string {
  const url = new URL(href, SITE_ORIGIN);
  if (href.endsWith("?")) {
    url.search = "";
  }

  return url.href;
}

function parseUtcDate(year: number, monthIndex: number, day: number): Date | undefined {
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
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

function parsePtDate(value: string): Date | undefined {
  const normalized = normalizeToken(value).replace(/[\u2013\u2014]/g, "-");

  const crossMonthMatch = normalized.match(/^(\d{1,2})\s+([a-z]+)\s*-\s*\d{1,2}\s+([a-z]+)\s+(\d{4})$/);
  if (crossMonthMatch) {
    const day = Number(crossMonthMatch[1]);
    const monthIndex = PT_MONTH_INDEX.get(crossMonthMatch[2] ?? "");
    const year = Number(crossMonthMatch[4]);
    return monthIndex == null ? undefined : parseUtcDate(year, monthIndex, day);
  }

  const rangeMatch = normalized.match(/^(\d{1,2})\s*-\s*\d{1,2}\s+([a-z]+)\s+(\d{4})$/);
  if (rangeMatch) {
    const day = Number(rangeMatch[1]);
    const monthIndex = PT_MONTH_INDEX.get(rangeMatch[2] ?? "");
    const year = Number(rangeMatch[3]);
    return monthIndex == null ? undefined : parseUtcDate(year, monthIndex, day);
  }

  const singleMatch = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!singleMatch) {
    return undefined;
  }

  const day = Number(singleMatch[1]);
  const monthIndex = PT_MONTH_INDEX.get(singleMatch[2] ?? "");
  const year = Number(singleMatch[3]);
  return monthIndex == null ? undefined : parseUtcDate(year, monthIndex, day);
}

function buildTitle(event: DraftEvent): string {
  const title = normalizeWhitespace(event.title) || normalizeWhitespace(event.fallbackTitle);
  const subtitle = normalizeWhitespace(event.subtitle);

  if (title.length > 0 && subtitle.length > 0 && !title.includes(subtitle)) {
    return `${title} - ${subtitle}`;
  }

  return title || subtitle;
}

function buildText(event: DraftEvent): string | undefined {
  const parts = [normalizeDateLabel(event.dateLabel), ...event.types, ...event.tags].filter(
    (value) => value.length > 0,
  );

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function buildEntry(event: DraftEvent): RSSEntry {
  return {
    id: event.link,
    link: event.link,
    title: buildTitle(event),
    text: buildText(event),
    imageURL: event.imageURL,
    datetime: event.datetime,
  };
}

export async function parse(response: Response): Promise<RSSData> {
  const events: DraftEvent[] = [];
  let currentType = "";
  let currentTag = "";
  let insideMobileTypes = false;
  let insideSubtitle = false;

  const rewriter = new HTMLRewriter()
    .on("article.events-item", {
      element() {
        events.push({
          link: "",
          title: "",
          subtitle: "",
          fallbackTitle: "",
          dateLabel: "",
          types: [],
          tags: [],
        });
      },
    })
    .on("article.events-item a[href]", {
      element(el) {
        const event = getLastEvent(events);
        if (!event || event.link) {
          return;
        }

        const href = el.getAttribute("href")?.trim();
        if (!href) {
          return;
        }

        event.link = normalizeEventLink(href);
      },
    })
    .on("article.events-item picture img", {
      element(el) {
        const event = getLastEvent(events);
        if (!event) {
          return;
        }

        const src = el.getAttribute("src")?.trim();
        if (!event.imageURL && src) {
          event.imageURL = toAbsoluteUrl(src);
        }

        const alt = el.getAttribute("alt")?.trim();
        if (!event.fallbackTitle && alt) {
          event.fallbackTitle = alt;
        }
      },
    })
    .on("article.events-item .event-date", {
      text(text) {
        const event = getLastEvent(events);
        if (!event || !text.text) {
          return;
        }

        event.dateLabel += text.text;
      },
      element(el) {
        el.onEndTag(() => {
          const event = getLastEvent(events);
          if (!event || event.datetime) {
            return;
          }

          event.datetime = parsePtDate(event.dateLabel);
        });
      },
    })
    .on("article.events-item .event-title", {
      text(text) {
        const event = getLastEvent(events);
        if (!event || !text.text) {
          return;
        }

        if (insideSubtitle) {
          event.subtitle += text.text;
          return;
        }

        event.title += text.text;
      },
    })
    .on("article.events-item .event-title .subtitle", {
      element(el) {
        insideSubtitle = true;
        el.onEndTag(() => {
          insideSubtitle = false;
        });
      },
    })
    .on("article.events-item .event-types.mobile", {
      element(el) {
        insideMobileTypes = true;
        el.onEndTag(() => {
          insideMobileTypes = false;
        });
      },
    })
    .on("article.events-item .event-types .type", {
      element(el) {
        currentType = "";
        el.onEndTag(() => {
          if (insideMobileTypes) {
            return;
          }

          const event = getLastEvent(events);
          if (!event) {
            return;
          }

          pushUnique(event.types, currentType);
        });
      },
      text(text) {
        currentType += text.text;
      },
    })
    .on("article.events-item .event-tags li", {
      element(el) {
        currentTag = "";
        el.onEndTag(() => {
          const event = getLastEvent(events);
          if (!event) {
            return;
          }

          pushUnique(event.tags, currentTag);
        });
      },
      text(text) {
        currentTag += text.text;
      },
    });

  const transformed = rewriter.transform(response);
  if (transformed.body == null) {
    throw new Error("Missing response body");
  }

  await consume(transformed.body);

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Agenda | Culturgest",
    description: "Agenda de eventos da Culturgest",
    language: "pt",
    entries: events.map(buildEntry).filter(isValidRSSEntry),
  };
}

export async function scrape(fetchFn: FetchFn): Promise<RSSData> {
  const response = await fetchFn(AJAX_URL, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "user-agent": USERAGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText} - ${AJAX_URL}`);
  }

  return parse(response);
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  return scrape(fetch);
}
