import { describe, expect, it } from "vitest";
import html from "./__fixtures__/observador-media.html";
import { parsePage, scrapePage } from "./observadorMedia";

const PAGE_URL = "https://observador.pt/seccao/sociedade/media/";

function createResponse(body: string) {
  return new Response(body, {
    headers: { "Content-Type": "text/html" },
  });
}

function readFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

describe("observadorMedia scraper", () => {
  it("parses section entries", async () => {
    const result = await parsePage(createResponse(html));

    expect(result.id).toBe(PAGE_URL);
    expect(result.link).toBe(PAGE_URL);
    expect(result.title).toBe("Observador - Media");
    expect(result.description).toBe("Observador Media");
    expect(result.language).toBe("pt");
    expect(result.entries).toEqual([
      {
        id: "https://observador.pt/2026/04/17/story-one/",
        link: "https://observador.pt/2026/04/17/story-one/",
        title: "Story One com espaços",
        text: "Lead One com espaços.",
        datetime: new Date("2026-04-17T10:10:16.000Z"),
        imageURL: "https://cdn.observador.pt/story-one.jpg",
      },
      {
        id: "https://observador.pt/newsletters/360/story-two/",
        link: "https://observador.pt/newsletters/360/story-two/",
        title: "Story Two",
        text: "Lead Two",
        datetime: new Date("2026-04-17T08:30:05.000Z"),
        imageURL: undefined,
      },
      {
        id: "https://observador.pt/opiniao/story-three/",
        link: "https://observador.pt/opiniao/story-three/",
        title: 'Story Three "Opinião"',
        text: "Maria João Exemplo",
        datetime: new Date("2026-04-15T00:26:52.000Z"),
        imageURL: "https://cdn.observador.pt/story-three.jpg",
      },
    ]);
  });

  it("fetches the section page", async () => {
    const fetchCalls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = readFetchUrl(input);
      fetchCalls.push(url);

      if (url === PAGE_URL) {
        return createResponse(html);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await scrapePage(fetchFn);

    expect(fetchCalls).toEqual([PAGE_URL]);
    expect(result.entries).toHaveLength(3);
  });
});
