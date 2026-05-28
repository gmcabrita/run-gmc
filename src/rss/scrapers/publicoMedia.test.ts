import { describe, expect, it } from "vitest";
import pageOneHtml from "./__fixtures__/publico-media-page-1.html";
import pageTwoHtml from "./__fixtures__/publico-media-page-2.html";
import { parsePage, scrapeFirstTwoPages } from "./publicoMedia";

const FIRST_PAGE_URL = "https://www.publico.pt/media";
const SECOND_PAGE_URL = "https://www.publico.pt/media?page=2";

function createResponse(html: string) {
  return new Response(html, {
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

describe("publicoMedia scraper", () => {
  it("parses featured and list entries with next page", async () => {
    const result = await parsePage(createResponse(pageOneHtml));

    expect(result.entries).toHaveLength(3);
    expect(result.nextPageURL).toBe(SECOND_PAGE_URL);
    expect(result.entries[0]).toEqual({
      id: "https://www.publico.pt/2026/05/27/media/noticia/featured-story-2176000",
      link: "https://www.publico.pt/2026/05/27/media/noticia/featured-story-2176000",
      title: "Featured Story com espaços",
      text: "Media",
      datetime: new Date("Wed, 27 May 2026 21:06:10 GMT"),
      imageURL: "https://imagens.publico.pt/imagens.aspx/100?tp=UH&w=320&h=180",
    });
    expect(result.entries[1]).toEqual({
      id: "https://www.publico.pt/2026/05/21/impar/noticia/list-story-one-2175510",
      link: "https://www.publico.pt/2026/05/21/impar/noticia/list-story-one-2175510",
      title: "List Story One",
      text: "Lead text for story one.",
      datetime: new Date("Thu, 21 May 2026 12:55:44 GMT"),
      imageURL: "https://imagens.publico.pt/imagens.aspx/200?tp=UH&w=480&h=270",
    });
    expect(result.entries[2]).toEqual({
      id: "https://www.publico.pt/2026/05/20/politica/noticia/list-story-two-2175461",
      link: "https://www.publico.pt/2026/05/20/politica/noticia/list-story-two-2175461",
      title: 'List Story Two "Premium"',
      text: "Política",
      datetime: new Date("Wed, 20 May 2026 10:00:00 GMT"),
      imageURL: undefined,
    });
  });

  it("fetches only the first two pages", async () => {
    const fetchCalls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = readFetchUrl(input);
      fetchCalls.push(url);

      if (url === FIRST_PAGE_URL) {
        return createResponse(pageOneHtml);
      }

      if (url === SECOND_PAGE_URL) {
        return createResponse(pageTwoHtml);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await scrapeFirstTwoPages(fetchFn);

    expect(fetchCalls).toEqual([FIRST_PAGE_URL, SECOND_PAGE_URL]);
    expect(result.id).toBe(FIRST_PAGE_URL);
    expect(result.link).toBe(FIRST_PAGE_URL);
    expect(result.title).toBe("Público - Media");
    expect(result.description).toBe("Público Media");
    expect(result.language).toBe("pt");
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Featured Story com espaços",
      "List Story One",
      'List Story Two "Premium"',
      "Page Two Featured",
      "Page Two List Story",
    ]);
    expect(result.entries[4]?.text).toBe("Older article from page two.");
  });
});
