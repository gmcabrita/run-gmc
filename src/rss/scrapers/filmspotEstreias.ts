import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
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

export async function parse(response: Response, maxDateStr?: string): Promise<RSSData> {
  const maxDate = maxDateStr ?? sevenDaysFromNow();
  const movies: FilmspotMovie[] = [];
  let currentDateString = "";
  let currentDateText = "";
  let currentDate = new Date();
  let skipCurrentSection = false;

  const rewriter = new HTMLRewriter()
    .on(".estreiasH2", {
      element(el) {
        const idAttr = el.getAttribute("id") ?? "";
        currentDateString = idAttr.match(/\d{8}$/)?.[0] ?? "";
        currentDate = parseDateFilmspot(currentDateString);
        skipCurrentSection = currentDateString > maxDate;
        currentDateText = "";
      },
      text(text) {
        if (text.text) {
          currentDateText += text.text;
        }
      },
    })
    .on(".filmeLista", {
      element() {
        if (skipCurrentSection) return;
        movies.push({
          imgUrl: undefined,
          originalTitle: undefined,
          title: "",
          url: undefined,
          metadata: "",
          date: currentDate,
          dateString: currentDateText,
        });
      },
    })
    .on(".filmeLista .filmeListaPoster > a > img", {
      element(el) {
        if (skipCurrentSection) return;
        const lastMovie = movies[movies.length - 1];
        const src = el.getAttribute("src");
        if (lastMovie && src) {
          lastMovie.imgUrl = src.replace("/thumb", "");
        }
      },
    })
    .on(".filmeLista .filmeListaInfo > h3 > a", {
      element(el) {
        if (skipCurrentSection) return;
        const lastMovie = movies[movies.length - 1];
        const href = el.getAttribute("href");
        if (lastMovie && href) {
          lastMovie.url = href;
        }
      },
    })
    .on(".filmeLista .filmeListaInfo > h3 > a > span:first-child", {
      text(text) {
        if (skipCurrentSection) return;
        const lastMovie = movies[movies.length - 1];
        if (lastMovie && text.text) {
          lastMovie.title = (lastMovie.title || "") + text.text;
        }
      },
    })
    .on(".filmeLista .filmeListaInfo .tituloOriginal", {
      text(text) {
        if (skipCurrentSection) return;
        const lastMovie = movies[movies.length - 1];
        if (lastMovie && text.text) {
          lastMovie.originalTitle = (lastMovie.originalTitle || "") + text.text;
        }
      },
    })
    .on(".filmeLista .filmeListaInfo > p.zsmall", {
      element() {
        if (skipCurrentSection) return;
        const lastMovie = movies[movies.length - 1];
        if (lastMovie && lastMovie.metadata) {
          lastMovie.metadata += "<br>";
        }
      },
      text(text) {
        if (skipCurrentSection) return;
        const lastMovie = movies[movies.length - 1];
        if (lastMovie && text.text && text.text !== "Ver trailer") {
          lastMovie.metadata = (lastMovie.metadata || "") + text.text;
        }
      },
    });

  await consume(rewriter.transform(response).body!);

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

  return parse(response);
}
