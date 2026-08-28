import { describe, expect, it } from "vitest";
import pageOneHtml from "./__fixtures__/jornal-de-negocios-media-page-1.html";
import pageTwoHtml from "./__fixtures__/jornal-de-negocios-media-page-2.html";
import { parsePage, scrapeFirstTwoPages } from "./jornalDeNegociosMedia";

const FIRST_PAGE_URL =
  "https://www.jornaldenegocios.pt/empresas/media/loadmore?friendlyUrl=empresas/media&contentStartIndex=0";
const SECOND_PAGE_URL =
  "https://www.jornaldenegocios.pt/empresas/media/loadmore?friendlyUrl=empresas/media&contentStartIndex=8&lastContentId=1505418";

function createResponse(html: string) {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function readFetchUrl(input: RequestInfo | URL): string {
  return new Request(input).url;
}

describe("jornalDeNegociosMedia scraper", () => {
  it("parses loadmore entries and next page", async () => {
    const result = await parsePage(createResponse(pageOneHtml));

    expect(result.entries).toHaveLength(2);
    expect(result.nextPageURL).toBe(SECOND_PAGE_URL);
    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-03-17T00:00:00.000Z"),
      id: "https://www.jornaldenegocios.pt/empresas/media/detalhe/story-one",
      imageURL: "https://cdn.jornaldenegocios.pt/images/story-one.jpg",
      link: "https://www.jornaldenegocios.pt/empresas/media/detalhe/story-one",
      text: "Autor Um",
      title: "Story One",
    });
    expect(result.entries[1]).toEqual({
      datetime: new Date("2026-03-16T00:00:00.000Z"),
      id: "https://www.jornaldenegocios.pt/empresas/media/detalhe/story-two",
      imageURL: undefined,
      link: "https://www.jornaldenegocios.pt/empresas/media/detalhe/story-two",
      text: "Autor Dois",
      title: 'Story Two "Premium"',
    });
  });

  it("fetches only the first two loadmore pages", async () => {
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
    expect(result.id).toBe("https://www.jornaldenegocios.pt/empresas/media");
    expect(result.link).toBe("https://www.jornaldenegocios.pt/empresas/media");
    expect(result.title).toBe("Jornal de Negocios - Media");
    expect(result.description).toBe("Jornal de Negocios Media");
    expect(result.language).toBe("pt");
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Story One",
      'Story Two "Premium"',
      "Story Three",
      "Story Four",
    ]);
    expect(result.entries[2]?.text).toBe("Autor Tres");
    expect(result.entries[3]?.text).toBe("Story Four");
  });

  it("retries retryable failures while loading a page", async () => {
    const fetchCalls: Array<string> = [];
    let firstPageAttempts = 0;
    const fetchFn: typeof fetch = async (input) => {
      const url = readFetchUrl(input);
      fetchCalls.push(url);

      if (url === FIRST_PAGE_URL) {
        firstPageAttempts += 1;

        if (firstPageAttempts === 1) {
          throw { message: "Network connection lost." };
        }

        if (firstPageAttempts === 2) {
          throw new Error("Network connection lost.");
        }

        return createResponse(pageOneHtml);
      }

      if (url === SECOND_PAGE_URL) {
        return createResponse(pageTwoHtml);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await scrapeFirstTwoPages(fetchFn);

    expect(fetchCalls).toEqual([
      FIRST_PAGE_URL,
      FIRST_PAGE_URL,
      FIRST_PAGE_URL,
      SECOND_PAGE_URL,
    ]);
    expect(result.entries).toHaveLength(4);
  });
});
