import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.ccb.pt/eventos/";
const AJAX_URL = "https://www.ccb.pt/wp-admin/admin-ajax.php";

type CCBCard = {
  id: string;
  link: string;
  title: string;
  fallbackTitle: string;
  dateLabel: string;
  description: string;
  venue: string;
  tags: string[];
  imageURL?: string;
  datetime?: Date;
};

function ignoreEntries(entry: RSSEntry): boolean {
  return (
    !entry.text?.includes("| Programa Vincular -") &&
    !entry.text?.includes("| Famílias |") &&
    !entry.text?.includes("Exposição permanente |") &&
    !entry.text?.includes("Atividades para famílias |") &&
    !entry.text?.includes("| Encontros para Pessoas com Demência e Famílias |") &&
    !entry.text?.includes("| Cursos &amp; Formação |") &&
    !entry.text?.includes("atividades-para-familias") &&
    !entry.text?.includes("| Artes nas Férias do Verão |") &&
    !entry.text?.includes("| Famílias")
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getLastCard(cards: CCBCard[]): CCBCard | undefined {
  return cards[cards.length - 1];
}

function parseImageUrl(style: string | null): string | undefined {
  if (!style) return undefined;

  const match = /url\((['"]?)(.*?)\1\)/.exec(style);
  const imagePath = match?.[2]?.trim();
  if (!imagePath) return undefined;

  return new URL(imagePath, BASE_URL).href;
}

function parseDatetimeFromLink(link: string): Date | undefined {
  const pathname = new URL(link).pathname;
  const match = /\/(\d{4})-(\d{2})-(\d{2})\/?$/.exec(pathname);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) {
    return undefined;
  }

  const datetime = new Date(Date.UTC(year, month - 1, day));
  if (
    datetime.getUTCFullYear() !== year ||
    datetime.getUTCMonth() !== month - 1 ||
    datetime.getUTCDate() !== day
  ) {
    return undefined;
  }

  return datetime;
}

function buildEntryText(card: CCBCard): string | undefined {
  const parts = [card.dateLabel, card.description, card.venue, ...card.tags]
    .map(normalizeText)
    .filter((value) => value.length > 0);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function buildEntry(card: CCBCard): RSSEntry {
  const title = normalizeText(card.title) || normalizeText(card.fallbackTitle);

  return {
    id: card.id,
    link: card.link,
    title,
    text: buildEntryText(card),
    imageURL: card.imageURL,
    datetime: card.datetime,
  };
}

export async function parse(response: Response): Promise<RSSData> {
  const cards: CCBCard[] = [];
  let currentTag = "";

  const rewriter = new HTMLRewriter()
    .on(".cards[id^='post-']", {
      element() {
        cards.push({
          id: "",
          link: "",
          title: "",
          fallbackTitle: "",
          dateLabel: "",
          description: "",
          venue: "",
          tags: [],
        });
      },
    })
    .on(".cards[id^='post-'] a.card_click", {
      element(el) {
        const card = getLastCard(cards);
        if (!card) return;

        const href = el.getAttribute("href")?.trim();
        if (href) {
          const link = new URL(href, BASE_URL).href;
          card.id = link;
          card.link = link;
          card.datetime = parseDatetimeFromLink(link);
        }

        const fallbackTitle = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
        if (!card.fallbackTitle) {
          card.fallbackTitle = fallbackTitle;
        }
      },
    })
    .on(".cards[id^='post-'] .card_img", {
      element(el) {
        const card = getLastCard(cards);
        if (!card || card.imageURL) return;

        card.imageURL = parseImageUrl(el.getAttribute("style"));
      },
    })
    .on(".cards[id^='post-'] .card_title", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) return;

        card.title += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_date", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) return;

        card.dateLabel += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_desc", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) return;

        card.description += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_info", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) return;

        card.venue += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_tag .tag", {
      element(el) {
        currentTag = "";
        el.onEndTag(() => {
          const card = getLastCard(cards);
          if (!card) return;

          const tag = normalizeText(currentTag);
          if (tag.length === 0 || tag === "..." || card.tags.includes(tag)) return;
          card.tags.push(tag);
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
    title: "Eventos | CCB",
    description: "Agenda de eventos do CCB",
    language: "pt",
    entries: cards.map(buildEntry).filter(ignoreEntries).filter(isValidRSSEntry),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "user-agent": USERAGENT,
    },
    body: new URLSearchParams({
      action: "ccbfilter",
      sortby: "cronologica",
    }),
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText} - ${AJAX_URL}`);
  }

  return parse(response);
}
