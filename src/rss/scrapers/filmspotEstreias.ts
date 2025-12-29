import { DOMParser } from "linkedom";
import { USERAGENT, isValidRSSEntry } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { FilmspotMovie } from "@types";

const BASE_URL = "https://filmspot.pt/estreias";

function dateToDateStringFilmspot(date: Date): string {
  return date.toISOString().split("T")[0].replaceAll("-", "");
}

function sevenDaysFromNow(): string {
  return dateToDateStringFilmspot(new Date(new Date().setDate(new Date().getDate() + 7)));
}

function parseDateFilmspot(dateString: string): Date {
  const dateStr = dateString.replaceAll("-", "");
  return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
}

export async function parse(html: string, maxDateStr?: string): Promise<RSSData> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const maxDate = maxDateStr ?? sevenDaysFromNow();

  const movies: FilmspotMovie[] = Array.from(document.querySelectorAll(".estreiasH2"))
    .filter((premiereNode) => {
      const el = premiereNode as Element;
      return (el.id.match(/\d{8}$/)?.[0] ?? "") <= maxDate;
    })
    .flatMap((premiereNode) => {
      const el = premiereNode as Element & { nextSibling: Element };
      const dateInText = el.textContent;
      const dateString = el.id.match(/\d{8}$/)?.[0] ?? "";
      const date = parseDateFilmspot(dateString);

      return Array.from(el.nextSibling.querySelectorAll(".filmeLista")).map((movieNode) => {
        const movieEl = movieNode as Element;
        return {
          imgUrl: movieEl
            .querySelector(".filmeListaPoster > a > img")
            ?.getAttribute("src")
            ?.replace("/thumb", ""),
          originalTitle: movieEl.querySelector(".tituloOriginal")?.textContent,
          title: movieEl.querySelector(".filmeListaInfo > h3 > a > span")?.textContent,
          url: movieEl.querySelector("* > a")?.getAttribute("href") ?? undefined,
          metadata: Array.from(movieEl.querySelectorAll(".zsmall"))
            .map((node) => (node as Element).textContent)
            .filter((text): text is string => text != null && text !== "Ver trailer")
            .join("<br>"),
          date,
          dateString: dateInText ?? "",
        };
      });
    });

  const entries: RSSEntry[] = movies.map((m) => {
    const link = `https://filmspot.pt${m.url ?? ""}`;
    const title = m.originalTitle ? `${m.title} (${m.originalTitle})` : (m.title ?? "");
    const text = `<strong>Estreia:</strong> ${m.dateString}<br><strong>Metadata:</strong> ${m.metadata ?? ""}`;

    return {
      id: link,
      link,
      title,
      text,
      datetime: m.date,
      imageURL: m.imgUrl,
    };
  });

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "filmSPOT – Próximas estreias",
    description: "filmSPOT – Próximas estreias",
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
