import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.ccb.pt/eventos/";
const AJAX_URL = "https://www.ccb.pt/wp-admin/admin-ajax.php";

type CCBCard = {
  dateLabel: string;
  datetime?: Date;
  description: string;
  fallbackTitle: string;
  id: string;
  imageURL?: string;
  link: string;
  tags: Array<string>;
  title: string;
  venue: string;
};

const IGNORED_TAGS = new Set(["Atividades", "Exposições"]);

const IGNORED_TEXT_PATTERNS = [
  "programa vincular",
  "| programa vincular -",
  "| famílias |",
  "exposição permanente |",
  "atividades para famílias |",
  "| encontros para pessoas com demência e famílias |",
  "| cursos & formação |",
  "| cursos &amp; formação |",
  "atividades-para-familias",
  "| artes nas férias do verão |",
  "| famílias",
];

function normalizeText(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return normalizeText(value).toLocaleLowerCase("pt-PT");
}

function getLastCard(cards: Array<CCBCard>): CCBCard | undefined {
  return cards.at(-1);
}

function parseImageUrl(style: string | null): string | undefined {
  if (!style) {return undefined;}

  const match = /url\((['"]?)(.*?)\1\)/.exec(style);
  const imagePath = match?.[2]?.trim();
  if (!imagePath) {return undefined;}

  return new URL(imagePath, BASE_URL).href;
}

function parseDatetimeFromLink(link: string): Date | undefined {
  const pathname = new URL(link).pathname;
  const match = /\/(\d{4})-(\d{2})-(\d{2})\/?$/.exec(pathname);
  if (!match) {return undefined;}

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

function getCardTitle(card: CCBCard): string {
  return normalizeText(card.title) || normalizeText(card.fallbackTitle);
}

function shouldIgnoreCard(card: CCBCard): boolean {
  if (card.tags.some((tag) => IGNORED_TAGS.has(tag))) {return true;}

  const haystack = normalizeSearchText(
    [getCardTitle(card), card.link, buildEntryText(card) ?? ""].join(" | "),
  );

  return IGNORED_TEXT_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function buildEntry(card: CCBCard): RSSEntry {
  const title = getCardTitle(card);

  return {
    datetime: card.datetime,
    id: card.id,
    imageURL: card.imageURL,
    link: card.link,
    text: buildEntryText(card),
    title,
  };
}

export async function parse(response: Response): Promise<RSSData> {
  const cards: Array<CCBCard> = [];
  let currentTag = "";

  const rewriter = new HTMLRewriter()
    .on(".cards[id^='post-']", {
      element() {
        cards.push({
          dateLabel: "",
          description: "",
          fallbackTitle: "",
          id: "",
          link: "",
          tags: [],
          title: "",
          venue: "",
        });
      },
    })
    .on(".cards[id^='post-'] a.card_click", {
      element(el) {
        const card = getLastCard(cards);
        if (!card) {return;}

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
        if (!card || card.imageURL) {return;}

        card.imageURL = parseImageUrl(el.getAttribute("style"));
      },
    })
    .on(".cards[id^='post-'] .card_title", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) {return;}

        card.title += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_date", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) {return;}

        card.dateLabel += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_desc", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) {return;}

        card.description += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_info", {
      text(text) {
        const card = getLastCard(cards);
        if (!card || !text.text) {return;}

        card.venue += text.text;
      },
    })
    .on(".cards[id^='post-'] .card_tag .tag", {
      element(el) {
        currentTag = "";
        el.onEndTag(() => {
          const card = getLastCard(cards);
          if (!card) {return;}

          const tag = normalizeText(currentTag);
          if (tag.length === 0 || tag === "..." || card.tags.includes(tag)) {return;}
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
    description: "Agenda de eventos do CCB",
    entries: cards.filter((card) => !shouldIgnoreCard(card)).map(buildEntry).filter(isValidRSSEntry),
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Eventos | CCB",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(AJAX_URL, {
    body: new URLSearchParams({
      action: "ccbfilter",
      sortby: "cronologica",
    }),
    headers: {
      "user-agent": USERAGENT,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText} - ${AJAX_URL}`);
  }

  return parse(response);
}
