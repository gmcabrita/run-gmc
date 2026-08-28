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
  return new Request(input).url;
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
        datetime: new Date("2026-04-17T10:10:16.000Z"),
        id: "https://observador.pt/2026/04/17/story-one/",
        imageURL: "https://cdn.observador.pt/story-one.jpg",
        link: "https://observador.pt/2026/04/17/story-one/",
        text: "Lead One com espaços.",
        title: "Story One com espaços",
      },
      {
        datetime: new Date("2026-04-17T08:30:05.000Z"),
        id: "https://observador.pt/newsletters/360/story-two/",
        imageURL: undefined,
        link: "https://observador.pt/newsletters/360/story-two/",
        text: "Lead Two",
        title: "Story Two",
      },
      {
        datetime: new Date("2026-04-15T00:26:52.000Z"),
        id: "https://observador.pt/opiniao/story-three/",
        imageURL: "https://cdn.observador.pt/story-three.jpg",
        link: "https://observador.pt/opiniao/story-three/",
        text: "Maria João Exemplo",
        title: 'Story Three "Opinião"',
      },
    ]);
  });

  it("fetches the section page", async () => {
    const fetchCalls: Array<string> = [];
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
