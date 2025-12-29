import { DOMParser } from "linkedom";
import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.fundoambiental.pt/listagem-noticias.aspx";

function parseDateFundoAmbiental(dateString: string): Date {
  const dateStr = dateString.replaceAll("-", "");
  return new Date(`${dateStr.slice(4, 8)}-${dateStr.slice(2, 4)}-${dateStr.slice(0, 2)}`);
}

export async function parse(html: string): Promise<RSSData> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const entries: RSSEntry[] = [];

  Array.from(document.querySelectorAll(".register")).forEach((node) => {
    const el = node as Element;
    const title = el.querySelector(".register-title")?.textContent ?? "";
    const url = el.querySelector(".register-title > a")?.getAttribute("href") ?? "";
    const body = el.querySelector(".register-text")?.textContent?.trim() ?? "";
    const dateString = el.querySelector(".register-date")?.textContent ?? "";
    const date = parseDateFundoAmbiental(dateString);

    entries.push({
      id: url,
      link: url,
      title,
      text: body,
      datetime: date,
    });
  });

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Fundo Ambiental – Últimas notícias",
    description: "Fundo Ambiental – Últimas notícias",
    language: "pt",
    entries: entries.filter(isValidRSSEntry),
  };
}

export async function get(): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const html = await response.text();
  return parse(html);
}
