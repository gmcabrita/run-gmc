import { Hono } from "hono";
import { Feed } from "feed";
import XPath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import xml2js from "xml2js";

function dateToDateString(date: Date): string {
  return date.toISOString().split("T")[0].replaceAll("-", "");
}

function sevenDaysFromNow(): string {
  return dateToDateString(new Date(new Date().setDate(new Date().getDate() + 7)));
}

function parseDate(dateString: string): Date {
  const dateStr = dateString.replaceAll("-", "");
  return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
}

function parseDateFundoAmbiental(dateString: string): Date {
  const dateStr = dateString.replaceAll("-", "");
  return new Date(`${dateStr.slice(4, 8)}-${dateStr.slice(2, 4)}-${dateStr.slice(0, 2)}`);
}

function parseDateTimeStr(dateTimeStr: string): Date {
  const dateStr = dateTimeStr.split(" ")[0].trim().replaceAll(".", "");
  const timeStr = dateTimeStr.split(" ")[1].trim().replaceAll(":", "");
  return new Date(
    `${dateStr.slice(4, 8)}-${dateStr.slice(2, 4)}-${dateStr.slice(0, 2)} ${timeStr.slice(
      0,
      2,
    )}:${timeStr.slice(2, 4)}`,
  );
}

function* generateNext31Dates() {
  const today = new Date();

  for (let i = 0; i < 31; i++) {
    // Yield the date in ISO 8601 format (e.g., "2025-08-04")
    yield today.toISOString().split("T")[0];

    // Increment the date by one day
    today.setDate(today.getDate() + 1);
  }
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
  const response = await fetch(
    "https://www.agendalx.pt/wp-json/agendalx/v1/events?per_page=1000000",
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
  }

  const now = new Date();
  const events: any = await response.json();

  for (const event of events) {
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

    const startDate = event.occurences?.length > 0 ? event.occurences[0] : event.StartDate;
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

  app.get("/rss.anteEstreias", async (c) => {
    const feed = new Feed({
      title: `Ante-Estreias Cinema`,
      id: `https://ante-estreias.blogs.sapo.pt`,
      link: `https://ante-estreias.blogs.sapo.pt`,
      description: "External URLs extracted from Ante-Estreias bilhetes cinema posts",
      language: "pt",
      copyright: "",
      updated: new Date(),
    });
    const response = await fetch("https://ante-estreias.blogs.sapo.pt/data/rss");
    const xmlText = await response.text();

    // Parse the XML to JS object
    const result = await xml2js.parseStringPromise(xmlText);

    // Filter items with exactly one category that is "- bilhetes cinema"
    const filteredItems = result.rss.channel[0].item.filter((item: any) => {
      const categories = item.category || [];
      return categories.length === 1 && categories[0] === "- bilhetes cinema";
    });

    for (const item of filteredItems) {
      const description = item.description[0];

      // Split the description into tr elements
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;

      while ((trMatch = trRegex.exec(description)) !== null) {
        const trContent = trMatch[1];

        // Find the first a tag with a title attribute in this tr
        const firstATagRegex = /<a[^>]*title=["']([^"']+)["'][^>]*>/i;
        const firstATagMatch = trContent.match(firstATagRegex);

        let movieTitle = "";
        if (firstATagMatch && firstATagMatch[1]) {
          movieTitle = firstATagMatch[1].trim();
        }

        // Find all external URLs in this tr
        const urlRegex = /<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
        let urlMatch;

        while ((urlMatch = urlRegex.exec(trContent)) !== null) {
          const url = urlMatch[1];

          // Check if it's an external URL
          if (!url.includes("ante-estreias.blogs.sapo.pt")) {
            feed.addItem({
              title: movieTitle || url,
              id: url,
              link: url,
              content: `<a href="${url}">${url}</a>`,
              date: new Date(item.pubDate[0]),
            });
          }
        }
      }
    }

    c.header("Content-Type", "application/rss+xml");
    c.header("Cache-Control", "public, max-age=600");
    return c.text(feed.rss2());
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

    const initialResponse: any = await fetch("https://gaming.amazon.com/home");
    const cookie = initialResponse.headers
      .get("set-cookie")
      .split("Secure, ")
      .map((item: any) => item.split(";")[0])
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
      body: '{"operationName":"OffersContext_Offers_And_Items","variables":{"pageSize":999},"extensions":{},"query":"query OffersContext_Offers_And_Items($dateOverride: Time, $pageSize: Int) {\\n  inGameLoot: items(collectionType: LOOT, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  expiring: items(collectionType: EXPIRING, dateOverride: $dateOverride) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  popular: items(collectionType: FEATURED, dateOverride: $dateOverride) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  games: items(collectionType: FREE_GAMES, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  eventRow1: items(collectionType: EVENT_ROW_1, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  eventRow2: items(collectionType: EVENT_ROW_2, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      ...Item\\n      __typename\\n    }\\n    __typename\\n  }\\n  featuredContent: items(collectionType: FEATURED_CONTENT, dateOverride: $dateOverride, pageSize: $pageSize) {\\n    items {\\n      id\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment Item on Item {\\n  id\\n  isFGWP\\n  isDirectEntitlement\\n  isRetailLinkItem\\n  grantsCode\\n  priority\\n  category\\n  ctaButtonText\\n  isTeaserCard\\n  showCountdownInHours\\n  assets {\\n    id\\n    title\\n    externalClaimLink\\n    shortformDescription\\n    cardMedia {\\n      defaultMedia {\\n        src1x\\n        src2x\\n        type\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n  product {\\n    id\\n    __typename\\n  }\\n  offers {\\n    id\\n    startTime\\n    endTime\\n    offerSelfConnection {\\n      eligibility {\\n        offerState\\n        isClaimed\\n        conflictingClaimAccount {\\n          obfuscatedEmail\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n  game {\\n    id\\n    isActiveAndVisible\\n    assets {\\n      title\\n      __typename\\n    }\\n    __typename\\n  }\\n  __typename\\n}\\n"}',
      method: "POST",
      mode: "cors",
      credentials: "include",
    });
    const json: any = await response.json();
    json.data.games.items.forEach((game: any) => {
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
  app.get("/rss.epicFreeiOSGames", async (c) => {
    const feed = new Feed({
      title: `Free games: Epic Games Store (iOS)`,
      id: `https://store.epicgames.com/en-US/free-games`,
      link: `https://store.epicgames.com/en-US/free-games`,
      description: "Free games from Epic Games Store (iOS)",
      language: "en",
      copyright: "",
      updated: new Date(),
    });

    const response = await fetch(
      "https://http-proxy.val.run/?finalUrl=https%3A%2F%2Fegs-platform-service.store.epicgames.com%2Fapi%2Fv2%2Fpublic%2Fdiscover%2Fhome%3Fcount%3D10%26country%3DPT%26locale%3Den%26platform%3Dios%26start%3D0%26store%3DEGS",
    );
    const json: any = await response.json();
    const freeGames = json.data.find((item: any) => item.type === "freeGame");

    freeGames.offers
      .filter((game: any) => {
        return game.content.purchase?.find(
          (purchase: any) => purchase.purchaseType === "Claim" && purchase.price.decimalPrice == 0,
        );
      })
      .forEach((game: any) => {
        const title = game.content.title;
        const pageSlug = game.content.mapping.slug;
        const link = `https://store.epicgames.com/en-US/p/${pageSlug}`;
        const id = game.content.catalogItemId;
        const date = new Date();

        if (title == null) throw new Error("no title found");
        if (pageSlug == null) throw new Error("no pageSlug found");

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
  app.get("/rss.epicFreeAndroidGames", async (c) => {
    const feed = new Feed({
      title: `Free games: Epic Games Store (Android)`,
      id: `https://store.epicgames.com/en-US/free-games`,
      link: `https://store.epicgames.com/en-US/free-games`,
      description: "Free games from Epic Games Store (Android)",
      language: "en",
      copyright: "",
      updated: new Date(),
    });

    const response = await fetch(
      "https://http-proxy.val.run/?finalUrl=https%3A%2F%2Fegs-platform-service.store.epicgames.com%2Fapi%2Fv2%2Fpublic%2Fdiscover%2Fhome%3Fcount%3D10%26country%3DPT%26locale%3Den%26platform%3Dandroid%26start%3D0%26store%3DEGS",
    );
    const json: any = await response.json();
    const freeGames = json.data.find((item: any) => item.type === "freeGame");

    freeGames.offers
      .filter((game: any) => {
        return game.content.purchase?.find(
          (purchase: any) => purchase.purchaseType === "Claim" && purchase.price.decimalPrice == 0,
        );
      })
      .forEach((game: any) => {
        const title = game.content.title;
        const pageSlug = game.content.mapping.slug;
        const link = `https://store.epicgames.com/en-US/p/${pageSlug}`;
        const id = game.content.catalogItemId;
        const date = new Date();

        if (title == null) throw new Error("no title found");
        if (pageSlug == null) throw new Error("no pageSlug found");

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
  app.get("/rss.epicFreeDesktopGames", async (c) => {
    const feed = new Feed({
      title: `Free games: Epic Games Store`,
      id: `https://store.epicgames.com/en-US/free-games`,
      link: `https://store.epicgames.com/en-US/free-games`,
      description: "Free games from Epic Games Store",
      language: "en",
      copyright: "",
      updated: new Date(),
    });

    const response = await fetch(
      "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=PT&allowCountries=PT",
    );
    const json: any = await response.json();
    const nowDate = new Date();
    json.data.Catalog.searchStore.elements
      .filter((offer: any) => {
        if (offer.promotions) {
          return offer.promotions.promotionalOffers.some((innerOffers: any) => {
            return innerOffers.promotionalOffers.some((pOffer: any) => {
              const startDate = new Date(pOffer.startDate);
              const endDate = new Date(pOffer.endDate);
              const isFree = pOffer.discountSetting.discountPercentage === 0;
              return startDate <= nowDate && nowDate <= endDate && isFree;
            });
          });
        } else {
          return false;
        }
      })
      .forEach((game: any) => {
        const pageSlug =
          game?.catalogNs?.mappings?.find((mapping: any) => mapping.pageType === "productHome")
            ?.pageSlug ??
          game?.catalogNs?.offerMappings?.find((mapping: any) => mapping.pageType === "productHome")
            ?.pageSlug ??
          game.productSlug;
        const title = game.title;
        const link = `https://store.epicgames.com/en-US/p/${pageSlug}`;
        const id = game.id;
        const date = new Date(
          game.promotions.promotionalOffers
            .map((innerOffers: any) =>
              innerOffers.promotionalOffers.find((pOffer: any) => {
                const startDate = new Date(pOffer.startDate);
                const endDate = new Date(pOffer.endDate);
                const isFree = pOffer.discountSetting.discountPercentage === 0;
                return startDate <= nowDate && nowDate <= endDate && isFree;
              }),
            )
            .filter(Boolean)[0].startDate,
        );

        if (title == null) {
          throw new Error("no title found");
        }
        if (pageSlug == null) {
          throw new Error("no pageSlug found");
        }

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

  app.get("/rss.scyllaDbMasterclasses", async (c) => {
    const baseUrl = "https://www.scylladb.com/company/events/";
    const feed = new Feed({
      title: "ScyllaDB Masterclass Events",
      id: baseUrl,
      link: baseUrl,
      language: "en",
      copyright: "",
      updated: new Date(),
    });

    const options = {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
    };

    const baseResponse = await fetch(baseUrl, options);
    if (baseResponse.status != 200) {
      throw `${baseResponse.status}: ${baseResponse.statusText} – ${baseUrl}`;
    }
    const baseText = await baseResponse.text();
    const security = baseText?.match(/"security":"([^"]+)"}/)?.[1];

    if (!security) throw "No security token found!";

    const response = await fetch("https://www.scylladb.com/wp-admin/admin-ajax.php", {
      ...options,
      method: "POST",
      body: `action=load_filtered_events&security=${security}&category_slug=masterclasses`,
    });
    if (response.status != 200) {
      throw `${response.status}: ${response.statusText} – https://www.scylladb.com/wp-admin/admin-ajax.php`;
    }
    const json: any = await response.json();

    (json.past + json.upcoming)
      .match(/https:\/\/lp\.scylladb\.com[^\s"'<>\[\]]*/g)
      .forEach((link: string) => {
        feed.addItem({
          id: link,
          title: link,
          link: link,
          content: `<a href="${link}">${link}</a>`,
        });
      });

    c.header("Content-Type", "application/rss+xml");
    c.header("Cache-Control", "public, max-age=600");
    return c.text(feed.rss2());
  });

  app.get("/rss.imagensDeMarca", async (c) => {
    const baseUrl = "https://www.imagensdemarca.pt/";
    const feed = new Feed({
      title: "Imagens de Marca",
      id: baseUrl,
      link: baseUrl,
      language: "pt",
      copyright: "",
      updated: new Date(),
    });

    const options = {
      method: "POST",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locale: "pt",
        target: "production",
        repeater: {
          pagination: {
            enabled: true,
            marginPagesDisplayed: 0,
            pageRangeDisplayed: 6,
            perPage: "100",
          },
          limit: { enabled: false, start: "0", end: "" },
          filters: [],
          collection: "cS1WZNnN6W",
          userSorts: {
            attr: "datetime_cB1vB7YcXz",
            direction: "desc",
            origin: "filters",
          },
          page: 1,
        },
        projectId: "nb1nraet4m",
      }),
    };

    const response = await fetch("https://repeater.bondlayer.com/fetch", options);
    const json: any = await response.json();

    const now = new Date();
    json.items.forEach((post: any) => {
      const id = post.id;
      const title = post._title.all;
      const link = new URL(`artigo/${post._slug.all}`, baseUrl).href;
      const imageUrl = (post.image_cHyPyUtO1f || post.image_cSyfYQnEab || post.image_crJeRfSWfz)
        ?.all;
      const image = imageUrl && imageUrl != "" ? `<br><img src="${imageUrl}"></img>` : null;
      const date = new Date(post.datetime_cB1vB7YcXz);

      if (date < now) {
        feed.addItem({
          id,
          title,
          link,
          content: `<a href="${link}">${link}</a>${image}`.trim(),
          date,
        });
      }
    });

    c.header("Content-Type", "application/rss+xml");
    c.header("Cache-Control", "public, max-age=600");
    return c.text(feed.rss2());
  });
}
