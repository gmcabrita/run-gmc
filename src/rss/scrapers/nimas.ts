import { DOMParser } from "linkedom";
import { USERAGENT, isValidRSSEntry } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://medeiafilmes.com/cinemas/cinema-medeia-nimas";

function parseDateTimeStrNimas(dateTimeStr: string): Date {
  const dateStr = dateTimeStr.split(" ")[0].trim().replaceAll(".", "");
  const timeStr = dateTimeStr.split(" ")[1].trim().replaceAll(":", "");
  return new Date(
    `${dateStr.slice(4, 8)}-${dateStr.slice(2, 4)}-${dateStr.slice(0, 2)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`,
  );
}

export async function parse(html: string): Promise<RSSData> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const entries: RSSEntry[] = [];

  Array.from(document.querySelectorAll("section > div > section[data-sticky-slug]")).forEach(
    (grouped) => {
      const groupEl = grouped as Element;
      const dateStr =
        groupEl.querySelector(".header-title > h1")?.textContent?.trim().replaceAll("\n", "") ?? "";

      Array.from(groupEl.querySelectorAll("article")).forEach((movie) => {
        const movieEl = movie as Element;
        const timeStr =
          movieEl
            .querySelector(".schedule-designation")
            ?.textContent?.trim()
            .replaceAll("\n", "") ?? "";
        const dateTimeStr = `${dateStr} ${timeStr}`;
        const dateTime = parseDateTimeStrNimas(dateTimeStr);

        const link = movieEl.querySelector(".schedule-content a ")?.getAttribute("href") ?? "";
        const titleNode = movieEl.querySelector(".schedule-content .t-headline");
        const title = titleNode?.textContent ?? "";
        const director = titleNode?.nextElementSibling?.textContent ?? "";
        const cycle = titleNode?.nextElementSibling?.nextElementSibling?.textContent?.trim() || "";
        const poster =
          movieEl
            .querySelector(".schedule-content .schedule-cell--poster div.object-image")
            ?.getAttribute("data-src") || "";
        const extra =
          movieEl
            .querySelector(
              ".schedule-content .schedule-cell:last-child > .t-text:nth-last-child(2)",
            )
            ?.textContent?.trim()
            ?.replaceAll("\n", "")
            ?.replaceAll(/\s+/g, " ") || "";

        const fullTitle = `${title}, ${director}`;
        const text = `${dateTimeStr}<br>${extra}<br><strong>Ciclo:</strong> ${cycle}<br>Letterboxd: https://letterboxd.com/search/${encodeURIComponent(title)}/?adult`;

        entries.push({
          id: link,
          link,
          title: fullTitle,
          text,
          datetime: dateTime,
          imageURL: poster || undefined,
        });
      });
    },
  );

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Programação Nimas",
    description: "Programação do Cinema Medeia Nimas",
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
