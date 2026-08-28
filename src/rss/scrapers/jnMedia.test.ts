import { describe, expect, it } from "vitest";
import pageOneHtml from "./__fixtures__/jn-media-page-1.html";
import pageTwoHtml from "./__fixtures__/jn-media-page-2.html";
import { parsePage, scrapeFirstTwoPages } from "./jnMedia";

const FIRST_PAGE_URL = "https://www.jn.pt/media";
const SECOND_PAGE_URL = "https://www.jn.pt/media?page=2";

function createResponse(html: string) {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function readFetchUrl(input: RequestInfo | URL): string {
  return new Request(input).url;
}

describe("jnMedia scraper", () => {
  it("parses noscript-wrapped section entries, excluding Mais Vistas", async () => {
    const result = await parsePage(createResponse(pageOneHtml));

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.title)).not.toContain("Most Viewed Story");
    expect(result.nextPageURL).toBe(SECOND_PAGE_URL);
    expect(result.entries[0]).toEqual({
      id: "https://www.jn.pt/media/artigo/story-one/18000001",
      imageURL: "https://staticx.noticiasilimitadas.pt/jn/story-one.jpg?brand=jn&w=3840",
      link: "https://www.jn.pt/media/artigo/story-one/18000001",
      text: "Conferência",
      title: "Story One com espaços",
    });
    expect(result.entries[1]).toEqual({
      id: "https://www.jn.pt/media/artigo/story-two/18000002",
      imageURL: undefined,
      link: "https://www.jn.pt/media/artigo/story-two/18000002",
      text: "Jornalismo",
      title: 'Story Two "Premium"',
    });
  });

  it("fetches only the first two pages", async () => {
    const fetchCalls: Array<string> = [];
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
    expect(result.title).toBe("JN - Média");
    expect(result.description).toBe("Jornal de Notícias Média");
    expect(result.language).toBe("pt");
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Story One com espaços",
      'Story Two "Premium"',
      "Story Three",
    ]);
    expect(result.entries[2]?.text).toBe("Televisão");
  });
});
