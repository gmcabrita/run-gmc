import { describe, expect, it } from "vitest";
import { USERAGENT } from "@rss/common";
import { parse, scrapeMediaApi } from "./dnMedia";

const API_URL =
  "https://www.dn.pt/api/v1/collections/media-geral?item-type=story&offset=0&limit=20";

const apiResponse = {
  items: [
    {
      id: "7b63da3f-b0e4-4aa5-92c2-7bf12f2e9a0d",
      story: {
        "first-published-at": 1_788_300_929_380,
        headline: "Revistas do universo ‘Lux’ têm novo dono: redação inteira despedida",
        "hero-image-s3-key": "dn/2026-09-01/rolxthvc/Lux-2.webp",
        id: "7b63da3f-b0e4-4aa5-92c2-7bf12f2e9a0d",
        "published-at": 1_788_300_929_380,
        slug: "media-geral/revistas-do-universo-lux-tm-novo-dono-redao-inteira-despedida",
        subheadline: "Fecho repentino da editora proprietária das ‘Lux’.\n",
        url: "https://www.dn.pt/media-geral/revistas-do-universo-lux-tm-novo-dono-redao-inteira-despedida",
      },
    },
    {
      id: "fallback-id",
      story: {
        "first-published-at": 1_787_161_929_742,
        headline: "João Marcelino é o novo diretor do Jornal Económico",
        slug: "/media-geral/joo-marcelino-o-novo-diretor-do-jornal-econmico",
        subheadline: " ",
        summary: "Ricardo Santos Ferreira estava a assumir interinamente as funções.",
      },
    },
    {
      id: "missing-link",
      story: {
        headline: "Entry without a link",
      },
    },
    {
      id: "invalid-story",
      story: "invalid",
    },
  ],
};

function createApiResponse() {
  return new Response(JSON.stringify(apiResponse), {
    headers: { "Content-Type": "application/json" },
  });
}

function readFetchUrl(input: RequestInfo | URL): string {
  return new Request(input).url;
}

const failedFetcher: typeof fetch = async () => new Response(null, { status: 503 });
const invalidPayloadFetcher: typeof fetch = async () =>
  new Response(JSON.stringify({ items: "invalid" }), {
    headers: { "Content-Type": "application/json" },
  });

describe("dnMedia scraper", () => {
  it("parses DN media entries", () => {
    const result = parse(apiResponse);

    expect(result).toMatchObject({
      description: "Diário de Notícias Media",
      id: "https://www.dn.pt/media-geral",
      language: "pt",
      link: "https://www.dn.pt/media-geral",
      title: "Diário de Notícias - Media",
    });
    expect(result.entries).toEqual([
      {
        datetime: new Date(1_788_300_929_380),
        id: "7b63da3f-b0e4-4aa5-92c2-7bf12f2e9a0d",
        imageURL: "https://media.assettype.com/dn/2026-09-01/rolxthvc/Lux-2.webp",
        link: "https://www.dn.pt/media-geral/revistas-do-universo-lux-tm-novo-dono-redao-inteira-despedida",
        text: "Fecho repentino da editora proprietária das ‘Lux’.",
        title: "Revistas do universo ‘Lux’ têm novo dono: redação inteira despedida",
      },
      {
        datetime: new Date(1_787_161_929_742),
        id: "fallback-id",
        imageURL: undefined,
        link: "https://www.dn.pt/media-geral/joo-marcelino-o-novo-diretor-do-jornal-econmico",
        text: "Ricardo Santos Ferreira estava a assumir interinamente as funções.",
        title: "João Marcelino é o novo diretor do Jornal Económico",
      },
    ]);
  });

  it("ignores embargoed stories", () => {
    const result = parse({
      items: [
        {
          id: "embargoed",
          story: {
            headline: "Embargoed story",
            "is-embargoed": true,
            url: "/media-geral/embargoed-story",
          },
        },
        {
          id: "public",
          story: {
            headline: "Public story",
            "is-embargoed": false,
            url: "/media-geral/public-story",
          },
        },
        {
          id: "invalid-embargo-state",
          story: {
            headline: "Invalid embargo state",
            "is-embargoed": "true",
            url: "/media-geral/invalid-embargo-state",
          },
        },
      ],
    });

    expect(result.entries.map((entry) => entry.title)).toEqual(["Public story"]);
  });

  it("ignores malformed optional fields and unsafe URLs", () => {
    const result = parse({
      items: [
        {
          id: 42,
          story: {
            headline: "Valid story",
            "hero-image-s3-key": "https://example.com/image.jpg",
            "published-at": "invalid",
            slug: "media-geral/valid-story",
            subheadline: 42,
            "updated-at": 1_788_300_000_000,
          },
        },
        {
          story: {
            headline: "Unsafe link",
            url: "javascript:alert(1)",
          },
        },
      ],
    });

    expect(result.entries).toEqual([
      {
        datetime: new Date(1_788_300_000_000),
        id: "https://www.dn.pt/media-geral/valid-story",
        imageURL: undefined,
        link: "https://www.dn.pt/media-geral/valid-story",
        text: "Valid story",
        title: "Valid story",
      },
    ]);
  });

  it("fetches the DN media API", async () => {
    const requests: Array<Request> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return createApiResponse();
    };

    const result = await scrapeMediaApi(fetchFn);

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(readFetchUrl(request)).toBe(API_URL);
    expect(request.headers.get("accept")).toBe("application/json, text/plain, */*");
    expect(request.headers.get("referer")).toBe("https://www.dn.pt/media-geral");
    expect(request.headers.get("user-agent")).toBe(USERAGENT);
    expect(result.entries).toHaveLength(2);
  });

  it("returns an empty feed for an invalid API payload", async () => {
    await expect(scrapeMediaApi(invalidPayloadFetcher)).resolves.toMatchObject({ entries: [] });
  });

  it("reports failed API requests", async () => {
    await expect(scrapeMediaApi(failedFetcher)).rejects.toThrow("DN media request failed: 503");
  });
});
