import { Feed } from "feed";
import { stripInvalidXmlChars } from "@rss/common";
import {
  array,
  fallback,
  looseObject,
  nullish,
  number,
  parse,
  pipe,
  record,
  safeParse,
  string,
  transform,
  union,
  unknown,
  type InferOutput,
} from "valibot";

const NamedValueSchema = looseObject({
  name: string(),
});
const OptionalTextSchema = fallback(nullish(string()), undefined);
const TextListSchema = pipe(
  union([array(string()), string()]),
  transform((value) =>
    Array.isArray(value) ? value : value.length > 0 ? [value] : [],
  ),
);
const AgendaLxEventSchema = looseObject({
  categories_name_list: fallback(
    nullish(record(string(), NamedValueSchema)),
    undefined,
  ),
  description: fallback(nullish(array(string())), undefined),
  featured_media_large: OptionalTextSchema,
  id: pipe(
    union([string(), number()]),
    transform(String),
  ),
  LastDate: OptionalTextSchema,
  link: string(),
  StartDate: OptionalTextSchema,
  string_dates: OptionalTextSchema,
  string_times: OptionalTextSchema,
  subtitle: fallback(nullish(TextListSchema), undefined),
  tags_name_list: fallback(
    nullish(record(string(), NamedValueSchema)),
    undefined,
  ),
  title: fallback(
    nullish(looseObject({ rendered: OptionalTextSchema })),
    undefined,
  ),
  venue: fallback(
    nullish(
      record(string(), looseObject({ name: OptionalTextSchema })),
    ),
    undefined,
  ),
});
const AgendaLxEventsPayloadSchema = array(unknown());

type AgendaLxEvent = InferOutput<typeof AgendaLxEventSchema>;
type AgendaLxEventsPayload = InferOutput<typeof AgendaLxEventsPayloadSchema>;

function parseAgendaLxEvents(payload: AgendaLxEventsPayload): Array<AgendaLxEvent> {
  return payload.flatMap((event) => {
    const result = safeParse(AgendaLxEventSchema, event);
    return result.success ? [result.output] : [];
  });
}

export async function cacheAgendaLx(env: CloudflareBindings) {
  const feed = new Feed({
    copyright: "",
    description: "Cultural events in Lisbon from AgendaLX",
    id: `https://www.agendalx.pt`,
    language: "pt",
    link: `https://www.agendalx.pt`,
    title: `AgendaLX Events`,
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
      const payload = parse(AgendaLxEventsPayloadSchema, await response.json());
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
          content,
          date: pubDate,
          id: guid,
          link,
          title: fullTitle,
        });
      }
    }
  }

  const rss2 = stripInvalidXmlChars(feed.rss2());
  await env.RUN_GMC_GENERIC_CACHE_KV.put("agenda-lx-eventos", rss2);

  return rss2;
}
