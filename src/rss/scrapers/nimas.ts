import { USERAGENT, isValidRSSEntry, type ScraperContext } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://medeiafilmes.com/cinemas/cinema-medeia-nimas";
const UPLOADS_BASE = "https://medeiafilmes.com/uploads/library/";
const PT_WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

interface NimasFilm {
  cycle_title: string | null;
  film_age_rating: string;
  film_director: string;
  film_genre: string;
  film_image: string;
  film_length: string;
  film_title: string;
  film_uri_title: string;
}

interface NimasSession {
  films: Array<NimasFilm>;
  time: string;
}

interface NimasDay {
  date: string;
  sessions: Record<string, NimasSession>;
}

interface NimasData {
  theater?: {
    programme: Record<string, NimasDay>;
  };
  theatre?: {
    programme: Record<string, NimasDay>;
  };
}

function getPTWeekday(date: Date): string {
  return PT_WEEKDAYS[date.getDay()] ?? "";
}

export function parse(html: string): RSSData {
  // Extract JSON data from global.data assignment
  const match = html.match(/global\.data\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (!match) {
    return {
      description: "Programação do Cinema Medeia Nimas",
      entries: [],
      id: BASE_URL,
      language: "pt",
      link: BASE_URL,
      title: "Programação Nimas",
    };
  }

  const data: NimasData = JSON.parse(match[1]);
  const programme = data.theater?.programme || data.theatre?.programme;

  if (!programme) {
    return {
      description: "Programação do Cinema Medeia Nimas",
      entries: [],
      id: BASE_URL,
      language: "pt",
      link: BASE_URL,
      title: "Programação Nimas",
    };
  }

  const entries: Array<RSSEntry> = [];

  for (const [dateStr, day] of Object.entries(programme)) {
    // dateStr is in YYYY-MM-DD format
    const displayDate = dateStr.split("-").reverse().join(".");

    for (const [, session] of Object.entries(day.sessions)) {
      const time = session.time;

      for (const film of session.films) {
        const datetime = new Date(`${dateStr}T${time}:00`);
        const weekday = getPTWeekday(datetime);
        const link = `https://medeiafilmes.com/filmes/${film.film_uri_title}`;
        const fullTitle = film.film_director
          ? `${film.film_title}, ${film.film_director}`
          : film.film_title;

        const extraParts = [film.film_genre, film.film_length, film.film_age_rating].filter(
          Boolean,
        );
        const extra = extraParts.join(" | ");

        const letterboxd = `https://letterboxd.com/search/films/${encodeURIComponent(film.film_title)}/?adult`;
        const text = `${weekday}, ${displayDate} ${time}<br>${extra}<br>${film.cycle_title || ""}<br><a href="${letterboxd}">Letterboxd Search</a>`;

        entries.push({
          datetime,
          id: link,
          imageURL: film.film_image ? `${UPLOADS_BASE}${film.film_image}` : undefined,
          link,
          text,
          title: fullTitle,
        });
      }
    }
  }

  return {
    description: "Programação do Cinema Medeia Nimas",
    entries: entries.filter(isValidRSSEntry),
    id: BASE_URL,
    language: "pt",
    link: BASE_URL,
    title: "Programação Nimas",
  };
}

export async function get(_ctx: ScraperContext): Promise<RSSData> {
  const response = await fetch(BASE_URL, {
    headers: {
      "user-agent": USERAGENT,
    },
  });

  const html = await response.text();
  return parse(html);
}
