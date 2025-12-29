import { USERAGENT, isValidRSSEntry, consume } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";

const BASE_URL = "https://medeiafilmes.com/cinemas/cinema-medeia-nimas";

function parseDateTimeStrNimas(dateStr: string, timeStr: string): Date {
  // dateStr format: "29.12.2025"
  // timeStr format: "13:00"
  const [day, month, year] = dateStr.split(".");
  const [hour, minute] = timeStr.split(":");
  return new Date(`${year}-${month}-${day} ${hour}:${minute}`);
}

interface MovieData {
  dateStr: string;
  timeStr: string;
  link: string;
  title: string;
  director: string;
  cycle: string;
  poster: string;
  extra: string;
}

export async function parse(html: string): Promise<RSSData> {
  const entries: RSSEntry[] = [];

  let currentDateStr = "";
  let currentMovie: Partial<MovieData> = {};
  let inArticle = false;
  let inScheduleContent = false;
  let inTitleLink = false;
  let inDirectorBold = false;
  let inCycleLink = false;

  function finalizeCurrentMovie() {
    if (currentMovie.link && currentMovie.title) {
      const dateTimeStr = `${currentMovie.dateStr} ${currentMovie.timeStr}`;
      const dateTime = parseDateTimeStrNimas(
        currentMovie.dateStr || "",
        currentMovie.timeStr || "",
      );
      const fullTitle = currentMovie.director
        ? `${currentMovie.title}, ${currentMovie.director}`
        : currentMovie.title;
      const text = `${dateTimeStr}<br>${currentMovie.extra || ""}<br>${currentMovie.cycle || ""}<br>Letterboxd: https://letterboxd.com/search/${encodeURIComponent(currentMovie.title || "")}/?adult`;

      entries.push({
        id: currentMovie.link,
        link: currentMovie.link,
        title: fullTitle,
        text,
        datetime: dateTime,
        imageURL: currentMovie.poster || undefined,
      });
    }
  }

  const rewriter = new HTMLRewriter()
    // Date is in header[data-sticky-slug] .header-title h1
    .on("header[data-sticky-slug]", {
      element(el) {
        // The data-sticky-slug contains the date in YYYY-MM-DD format
        const slug = el.getAttribute("data-sticky-slug");
        if (slug && slug.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Convert from YYYY-MM-DD to DD.MM.YYYY
          const [year, month, day] = slug.split("-");
          currentDateStr = `${day}.${month}.${year}`;
        }
      },
    })
    // Also capture from h1 text for the DD.MM.YYYY format
    .on(".header-title h1", {
      text(text) {
        const content = text.text.trim();
        if (content.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
          currentDateStr = content;
        }
      },
    })
    // Each article is a screening
    .on("article.schedule", {
      element() {
        // Finalize previous movie if any
        if (inArticle && currentMovie.link) {
          finalizeCurrentMovie();
        }
        inArticle = true;
        inScheduleContent = false;
        inTitleLink = false;
        inDirectorBold = false;
        inCycleLink = false;
        currentMovie = {
          dateStr: currentDateStr,
          timeStr: "",
          link: "",
          title: "",
          director: "",
          cycle: "",
          poster: "",
          extra: "",
        };
      },
    })
    // Time is in .schedule-designation h3
    .on(".schedule-designation h3", {
      text(text) {
        if (currentMovie) {
          const content = text.text.trim();
          if (content.match(/^\d{1,2}:\d{2}$/)) {
            currentMovie.timeStr = content;
          }
        }
      },
    })
    .on(".schedule-content", {
      element() {
        inScheduleContent = true;
      },
    })
    // Title and link in .schedule-content h3 a
    .on(".schedule-content h3 a", {
      element(el) {
        if (inScheduleContent && currentMovie) {
          currentMovie.link = el.getAttribute("href") || "";
          inTitleLink = true;
        }
      },
      text(text) {
        if (inTitleLink && currentMovie) {
          currentMovie.title = (currentMovie.title || "") + text.text.trim();
        }
      },
    })
    // Director in .schedule-content .t-text b
    .on(".schedule-content .t-text b", {
      element() {
        if (inScheduleContent) {
          inDirectorBold = true;
        }
      },
      text(text) {
        if (inDirectorBold && currentMovie) {
          let director = text.text.trim();
          // Remove "de " prefix if present
          if (director.startsWith("de ")) {
            director = director.slice(3);
          }
          currentMovie.director = (currentMovie.director || "") + director;
        }
      },
    })
    // Poster in .object-image data-src
    .on(".schedule-content .object-image", {
      element(el) {
        if (currentMovie) {
          currentMovie.poster = el.getAttribute("data-src") || "";
        }
      },
    })
    // Cycle in link containing /ciclos/
    .on(".schedule-content a[href*='/ciclos/']", {
      element() {
        if (inScheduleContent) {
          inCycleLink = true;
        }
      },
      text(text) {
        if (inCycleLink && currentMovie) {
          currentMovie.cycle = (currentMovie.cycle || "") + text.text.trim();
        }
      },
    })
    // Extra info (genre, duration, rating) in .schedule-cell ul li
    .on(".schedule-content .schedule-cell ul.u-line li", {
      text(text) {
        if (currentMovie) {
          const content = text.text
            .trim()
            .replace(/\|/g, "")
            .replace(/&nbsp;/g, "")
            .replace(/\u00a0/g, " ")
            .trim();
          if (content && content !== "|") {
            currentMovie.extra = currentMovie.extra
              ? currentMovie.extra + " | " + content
              : content;
          }
        }
      },
    });

  const response = new Response(html);
  const rewritten = rewriter.transform(response);
  await consume(rewritten.body!);

  // Finalize the last movie
  if (inArticle && currentMovie.link) {
    finalizeCurrentMovie();
  }

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
