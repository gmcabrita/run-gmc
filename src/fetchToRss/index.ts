import { Hono } from "hono";
import { Feed } from "feed";
import XPath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import type { AgendaLxEvent, PrimeGamingResponse } from "@types";

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
        `https://www.agendalx.pt/wp-json/agendalx/v1/events?per_page=5000&categories=${category}&_fields=id,title,subtitle,description,venue,categories_name_list,tags_name_list,StartDate,string_dates,string_times,featured_media_large`
      );
      return await response.json<AgendaLxEvent[]>();
    })
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

        const link = event.link || `https://www.agendalx.pt/events/event/${event.id}/`;
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

export function addFetchToRssEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get("/rss.agendaLx", async (c) => {
    const rss2 = (await c.env.RUN_GMC_GENERIC_CACHE_KV.get("agenda-lx-eventos")) || "";

    if (rss2) {
      c.header("Content-Type", "application/rss+xml");
      c.header("Cache-Control", "public, max-age=600");
    }
    return c.text(rss2);
  });

  app.get("/rss.cacheAgendaLx", async (c) => {
    const rss2 = await cacheAgendaLx(c.env);

    c.header("Content-Type", "application/rss+xml");
    c.header("Cache-Control", "public, max-age=600");
    return c.text(rss2);
  });

  app.get("/rss.primeFreeGames", async (c) => {
    const feed = new Feed({
      title: `Free games: Prime Gaming`,
      id: `https://gaming.amazon.com/home`,
      link: `https://gaming.amazon.com/home`,
      description: "Free games from Prime Gaming",
      language: "en",
      copyright: "",
      updated: new Date(),
    });

    const initialResponse = await fetch("https://gaming.amazon.com/home");
    const cookie = (initialResponse.headers.get("set-cookie") ?? "")
      .split("Secure, ")
      .map((item: string) => item.split(";")[0])
      .join("; ");
    const html = await initialResponse.text();

    const domParser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: () => {},
        fatalError: (err) => {
          throw new Error(err);
        },
      },
    });

    const document = domParser.parseFromString(html, "text/xml");
    const csrfToken: string =
      (
        XPath.select1("//input[contains(string(@name), 'csrf-key')]/@value", document) as
          | Attr
          | undefined
      )?.value || "";

    const response = await fetch("https://gaming.amazon.com/graphql", {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "client-id": "CarboniteApp",
        "content-type": "application/json",
        cookie: cookie,
        "csrf-token": csrfToken,
        pragma: "no-cache",
        "prime-gaming-language": "en-US",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
      referrer: "https://gaming.amazon.com/home",
      body: '{"operationName":"OffersContext_Offers_And_Items","variables":{"pageSize":999},"extensions":{},"query":"query OffersContext_Offers_And_Items($dateOverride: Time, $pageSize: Int) {\\n  inGameLoot: items(collectionType: LOOT, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  expiring: items(collectionType: EXPIRING, dateOverride: $dateOverride) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  popular: items(collectionType: FEATURED, dateOverride: $dateOverride) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  games: items(collectionType: FREE_GAMES, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  eventRow1: items(collectionType: EVENT_ROW_1, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  eventRow2: items(collectionType: EVENT_ROW_2, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  featuredContent: items(collectionType: FEATURED_CONTENT, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      id\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment Item on Item {\\n  id\\n  isFGWP\\n  isDirectEntitlement\\n  isRetailLinkItem\\n  grantsCode\\n  priority\\n  category\\n  ctaButtonText\\n  isTeaserCard\\n  showCountdownInHours\\n  assets {\\n    id\\n    title\\n    externalClaimLink\\n    shortformDescription\\n    cardMedia {\\n      defaultMedia {\\n        src1x\\n        src2x\\n        type\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n  product {\\n    id\\n    __typename\\n  }\\n  offers {\\n    id\\n    startTime\\n    endTime\\n    offerSelfConnection {\\n      eligibility {\\n        canClaim\\n        isClaimed\\n        conflictingClaimAccount {\\n          obfuscatedEmail\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n  __typename\\n}\\n"}',
      method: "POST",
      mode: "cors",
      credentials: "include",
    });
    const json = (await response.json()) as PrimeGamingResponse;
    json.data.games.items.forEach((game) => {
      const title = game.assets.title;
      const link = game.assets.externalClaimLink;
      const id = game.assets.id;
      const date = new Date(game.offers[0].startTime);

      if (title == null) throw new Error("no title found");
      if (link == null) throw new Error("no link found");

      feed.addItem({
        title,
        id,
        link,
        content: `<a href="${link}">${link}</a>`,
        date,
      });
    });

    c.header("Content-Type", "application/rss+xml");
    c.header("Cache-Control", "public, max-age=600");
    return c.text(feed.rss2());
  });
}
