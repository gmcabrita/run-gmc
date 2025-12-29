import { DOMParser } from "linkedom";
import { USERAGENT, isValidRSSEntry } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://www.cinemateca.pt/Programacao.aspx";

function parseDateTimeStrCinemateca(dateTimeStr: string): Date {
  const dateStr = dateTimeStr.split(",")[0].trim().replaceAll("/", "");
  const timeStr = dateTimeStr.split(",")[1].trim().replaceAll("h", "");
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

export async function parse(html: string): Promise<RSSData> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const entries: RSSEntry[] = [];

  Array.from(document.querySelectorAll(".content > .w315")).forEach((node) => {
    const el = node as Element;
    const infoBiblioNodes = Array.from(el.querySelectorAll(".infoBiblio")) as Element[];
    const title = el.querySelector(".infoTitle")?.textContent ?? "";
    const director = infoBiblioNodes?.[1]?.textContent ?? "";
    const extra = infoBiblioNodes?.[0]?.textContent || "";
    const extra2 = infoBiblioNodes?.[2]?.textContent || "";
    const infoDate = el.querySelector(".infoDate")?.textContent ?? "";
    const room = infoDate.split("|")?.[1]?.trim() ?? "";
    const dateTimeStr = infoDate.split("|")?.[0]?.trim() ?? "";

    if (!dateTimeStr) return;

    const dateTime = parseDateTimeStrCinemateca(dateTimeStr);
    const parentEl = el.parentNode as Element | null;
    const grandParentEl = parentEl?.parentNode as Element | null;
    const greatGrandParentEl = grandParentEl?.parentNode as Element | null;
    const link = `${BASE_URL}${greatGrandParentEl?.getAttribute("href") ?? ""}`;

    const fullTitle = `${title}, ${director}`;
    const text = `${dateTimeStr}<br>${extra}<br>${extra2}<br>${room}<br>Letterboxd: https://letterboxd.com/search/${encodeURIComponent(title)}/?adult`;

    entries.push({
      id: link,
      link,
      title: fullTitle,
      text,
      datetime: dateTime,
    });
  });

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "Programação Cinemateca",
    description: "Programação da Cinemateca",
    language: "pt",
    entries: entries.filter(isValidRSSEntry),
  };
}

export async function get(): Promise<RSSData> {
  const scrapeUrls = Array.from(generateNextDates()).map((date) => `${BASE_URL}?date=${date}`);

  const responseTexts = await Promise.all(
    scrapeUrls.map((url) =>
      fetch(url, {
        headers: { "user-agent": USERAGENT },
      }).then((r) => r.text()),
    ),
  );

  const allEntries: RSSEntry[] = [];
  for (const text of responseTexts) {
    const result = await parse(text);
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
