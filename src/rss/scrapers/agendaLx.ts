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
  transform((value) => (Array.isArray(value) ? value : value.length > 0 ? [value] : [])),
);
const AgendaLxEventSchema = looseObject({
  categories_name_list: fallback(nullish(record(string(), NamedValueSchema)), undefined),
  description: fallback(nullish(array(string())), undefined),
  featured_media_large: OptionalTextSchema,
  id: pipe(union([string(), number()]), transform(String)),
  LastDate: OptionalTextSchema,
  link: string(),
  StartDate: OptionalTextSchema,
  string_dates: OptionalTextSchema,
  string_times: OptionalTextSchema,
  subtitle: fallback(nullish(TextListSchema), undefined),
  tags_name_list: fallback(nullish(record(string(), NamedValueSchema)), undefined),
  title: fallback(nullish(looseObject({ rendered: OptionalTextSchema })), undefined),
  venue: fallback(nullish(record(string(), looseObject({ name: OptionalTextSchema }))), undefined),
});
const AgendaLxEventsPayloadSchema = array(unknown());

type AgendaLxEvent = InferOutput<typeof AgendaLxEventSchema>;
type AgendaLxEventsPayload = InferOutput<typeof AgendaLxEventsPayloadSchema>;
type NamedValues = Record<string, InferOutput<typeof NamedValueSchema>> | null | undefined;

const AGENDA_LX_CATEGORIES = [
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

function parseAgendaLxEvents(payload: AgendaLxEventsPayload): Array<AgendaLxEvent> {
  return payload.flatMap((event) => {
    const result = safeParse(AgendaLxEventSchema, event);
    return result.success ? [result.output] : [];
  });
}

async function fetchAgendaLxEvents(category: string): Promise<Array<AgendaLxEvent>> {
  const response = await fetch(
    `https://www.agendalx.pt/wp-json/agendalx/v1/events?per_page=5000&categories=${category}&_fields=id,link,title,subtitle,description,venue,categories_name_list,tags_name_list,StartDate,LastDate,string_dates,string_times,featured_media_large`,
  );
  const payload = parse(AgendaLxEventsPayloadSchema, await response.json());
  return parseAgendaLxEvents(payload);
}

function readVenue(event: AgendaLxEvent): string {
  if (!event.venue) {
    return "";
  }

  const venue = Object.values(event.venue)[0];
  return venue && venue.name ? venue.name : "";
}

function joinNames(values: NamedValues): string {
  return values
    ? Object.values(values)
        .map((value) => value.name)
        .join(", ")
    : "";
}

function buildEventContent(event: AgendaLxEvent, title: string): string {
  const description =
    event.description && event.description.length > 0 ? event.description.join("\n\n") : "";
  const venue = readVenue(event);
  const categories = joinNames(event.categories_name_list);
  const tags = joinNames(event.tags_name_list);
  const image = event.featured_media_large || "";
  const dates = event.string_dates || "";
  const times = event.string_times || "";
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

  return content;
}

function addEventsToFeed(feed: Feed, responses: Array<Array<AgendaLxEvent>>, now: Date): void {
  const seenIds = new Set<string>();

  for (const responseEvents of responses) {
    for (const event of responseEvents) {
      if (seenIds.has(event.id)) {
        continue;
      }

      seenIds.add(event.id);
      const title = event.title?.rendered || "Untitled Event";
      const subtitle = event.subtitle ? event.subtitle.join(" - ") : "";
      feed.addItem({
        content: buildEventContent(event, title),
        date: new Date(event.StartDate || now),
        id: `agendalx-event-${event.id}`,
        link: event.link,
        title: subtitle ? `${title} - ${subtitle}` : title,
      });
    }
  }
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
  const responses = await Promise.all(AGENDA_LX_CATEGORIES.map(fetchAgendaLxEvents));
  addEventsToFeed(feed, responses, new Date());

  const rss2 = stripInvalidXmlChars(feed.rss2());
  await env.RUN_GMC_GENERIC_CACHE_KV.put("agenda-lx-eventos", rss2);

  return rss2;
}
