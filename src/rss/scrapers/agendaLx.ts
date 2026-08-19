import { Feed } from "feed";
import { stripInvalidXmlChars } from "@rss/common";
import * as v from "valibot";

const NamedValueSchema = v.looseObject({
  name: v.string(),
});
const OptionalTextSchema = v.fallback(v.nullish(v.string()), undefined);
const TextListSchema = v.pipe(
  v.union([v.array(v.string()), v.string()]),
  v.transform((value) =>
    Array.isArray(value) ? value : value.length > 0 ? [value] : [],
  ),
);
const AgendaLxEventSchema = v.looseObject({
  id: v.pipe(
    v.union([v.string(), v.number()]),
    v.transform((value) => String(value)),
  ),
  title: v.fallback(
    v.nullish(v.looseObject({ rendered: OptionalTextSchema })),
    undefined,
  ),
  subtitle: v.fallback(v.nullish(TextListSchema), undefined),
  description: v.fallback(v.nullish(v.array(v.string())), undefined),
  venue: v.fallback(
    v.nullish(
      v.record(v.string(), v.looseObject({ name: OptionalTextSchema })),
    ),
    undefined,
  ),
  categories_name_list: v.fallback(
    v.nullish(v.record(v.string(), NamedValueSchema)),
    undefined,
  ),
  tags_name_list: v.fallback(
    v.nullish(v.record(v.string(), NamedValueSchema)),
    undefined,
  ),
  StartDate: OptionalTextSchema,
  LastDate: OptionalTextSchema,
  string_dates: OptionalTextSchema,
  string_times: OptionalTextSchema,
  featured_media_large: OptionalTextSchema,
  link: v.string(),
});
const AgendaLxEventsPayloadSchema = v.array(v.unknown());

type AgendaLxEvent = v.InferOutput<typeof AgendaLxEventSchema>;
type AgendaLxEventsPayload = v.InferOutput<typeof AgendaLxEventsPayloadSchema>;

function parseAgendaLxEvents(payload: AgendaLxEventsPayload): AgendaLxEvent[] {
  return payload.flatMap((event) => {
    const result = v.safeParse(AgendaLxEventSchema, event);
    return result.success ? [result.output] : [];
  });
}

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
    "cinema",
    "teatro",
    "musica",
    "artes",
    "feiras",
    "literatura",
    "visitas-guiadas",
    "ciencias",
    "stand-up-comedy",
    "danca",
  ];

  const responses = await Promise.all(
    categories.map(async (category: string) => {
      const response = await fetch(
        `https://www.agendalx.pt/wp-json/agendalx/v1/events?per_page=5000&categories=${category}&_fields=id,link,title,subtitle,description,venue,categories_name_list,tags_name_list,StartDate,LastDate,string_dates,string_times,featured_media_large`,
      );
      const payload = v.parse(AgendaLxEventsPayloadSchema, await response.json());
      return parseAgendaLxEvents(payload);
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
          const venueObj = Object.values(event.venue)[0];
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

        const startDate = event.StartDate;

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

  const rss2 = stripInvalidXmlChars(feed.rss2());
  await env.RUN_GMC_GENERIC_CACHE_KV.put("agenda-lx-eventos", rss2);

  return rss2;
}
