import { Feed } from "feed";
import type { AgendaLxEvent } from "@types";

export async function cacheAgendaLx(env: CloudflareBindings) {
  const feed = new Feed({
    title: `AgendaLX Events`,
    id: `https://www.agendalx.pt`,
    link: `https://www.agendalx.pt`,
    description: "Cultural events in Lisbon from AgendaLX",
    language: "pt",
    copyright: "",
    updated: new Date(),
  });

  const categories = [
    "artes",
    "musica",
    "teatro",
    "cinema",
    "feiras",
    "danca",
    "literatura",
    "visitas-guiadas",
    "ciencias",
    "stand-up-comedy",
  ];

  const responses = await Promise.all(
    categories.map(async (category: string) => {
      const response = await fetch(
        `https://www.agendalx.pt/wp-json/agendalx/v1/events?per_page=5000&categories=${category}&_fields=id,link,title,subtitle,description,venue,categories_name_list,tags_name_list,StartDate,string_dates,string_times,featured_media_large`,
      );
      return await response.json<AgendaLxEvent[]>();
    }),
  );

  const seenIds = new Set<string>();
  const now = new Date();
  for (const responseEvents of responses) {
    for (const event of responseEvents) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);

        const title = event.title?.rendered || "Untitled Event";
        const subtitle = event.subtitle ? event.subtitle.join(" - ") : "";
        const fullTitle = subtitle ? `${title} - ${subtitle}` : title;

        let description = "";
        if (event.description && event.description.length > 0) {
          description = event.description.join("\n\n");
        }

        let venue = "";
        if (event.venue) {
          const venueObj = Object.values(event.venue)[0] as { name?: string } | undefined;
          if (venueObj && venueObj.name) {
            venue = venueObj.name;
          }
        }

        const categories = event.categories_name_list
          ? Object.values(event.categories_name_list)
              .map((cat) => cat.name)
              .join(", ")
          : "";
        const tags = event.tags_name_list
          ? Object.values(event.tags_name_list)
              .map((tag) => tag.name)
              .join(", ")
          : "";

        const startDate =
          event.occurences && event.occurences.length > 0 ? event.occurences[0] : event.StartDate;
        const dates = event.string_dates || "";
        const times = event.string_times || "";

        const image = event.featured_media_large || "";

        let content = `
            <p><strong>Datas:</strong> ${dates}</p>
            <p><strong>Horários:</strong> ${times}</p>
          `;

        if (venue) {
          content += `<p><strong>Local:</strong> ${venue}</p>`;
        }

        if (categories) {
          content += `<p><strong>Categorias:</strong> ${categories}</p>`;
        }

        if (tags) {
          content += `<p><strong>Tags:</strong> ${tags}</p>`;
        }

        if (image) {
          content += `<p><img src="${image}" alt="${title}" /></p>`;
        }

        if (description) {
          content += `<div>${description}</div>`;
        }

        const link = event.link;
        const pubDate = new Date(startDate || now);
        const guid = `agendalx-event-${event.id}`;

        feed.addItem({
          title: fullTitle,
          id: guid,
          link,
          content,
          date: pubDate,
        });
      }
    }
  }

  const rss2 = feed.rss2();
  await env.RUN_GMC_GENERIC_CACHE_KV.put("agenda-lx-eventos", rss2);

  return rss2;
}
