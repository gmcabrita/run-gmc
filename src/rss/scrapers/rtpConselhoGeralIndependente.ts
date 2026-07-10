import { USERAGENT, consume, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const PAGE_URL = "https://media.rtp.pt/empresa/orgaos-sociais/conselho-geral-independente/";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function parse(response: Response): Promise<RSSData> {
  const entries: Array<RSSEntry> = [];
  let currentEntry: RSSEntry | null = null;
  let headingText = "";
  let inHighlights = false;

  const rewriter = new HTMLRewriter()
    .on("#artigo strong", {
      element() {
        headingText = "";
      },
      text(text) {
        headingText += text.text;
        if (normalizeWhitespace(headingText).toLocaleUpperCase("pt-PT") === "EM DESTAQUE:") {
          inHighlights = true;
        }
      },
    })
    .on("#artigo > ul", {
      element() {
        inHighlights = false;
        currentEntry = null;
      },
    })
    .on("#artigo a[href]", {
      element(el) {
        const href = el.getAttribute("href");
        if (!inHighlights || !href) {
          currentEntry = null;
          return;
        }

        const link = new URL(href, PAGE_URL).toString();
        currentEntry = {
          id: link,
          link,
          title: "",
          text: "",
        };
        entries.push(currentEntry);
      },
      text(text) {
        if (currentEntry) {
          currentEntry.title += text.text;
        }
      },
    });

  const body = rewriter.transform(response).body;
  if (body) {
    await consume(body);
  }

  return {
    id: PAGE_URL,
    link: PAGE_URL,
    title: "RTP – Conselho Geral Independente",
    description: "Destaques publicados pelo Conselho Geral Independente da RTP.",
    language: "pt",
    entries: entries
      .map((entry) => {
        const title = normalizeWhitespace(entry.title);
        return {
          ...entry,
          title,
          text: title,
        };
      })
      .filter((entry) => isValidRSSEntry(entry)),
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(PAGE_URL, {
    headers: {
      "user-agent": USERAGENT,
      "Content-Type": "text/html",
    },
  });

  return parse(response);
}
