import { describe, expect, it } from "vitest";
import pageOneHtml from "./__fixtures__/cm-jornal-tv-media-page-1.html";
import pageTwoHtml from "./__fixtures__/cm-jornal-tv-media-page-2.html";
import { parsePage, scrapeFirstTwoPages } from "./cmJornalTvMedia";

const FIRST_PAGE_URL =
  "https://www.cmjornal.pt/tv-media/loadmore?friendlyUrl=tv-media&contentStartIndex=0";
const SECOND_PAGE_URL =
  "https://www.cmjornal.pt/tv-media/loadmore?friendlyUrl=tv-media&urlRefParameters=&contentStartIndex=10&lastContentId=2491168";

function createResponse(html: string) {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function readFetchUrl(input: RequestInfo | URL): string {
  return new Request(input).url;
}

describe("cmJornalTvMedia scraper", () => {
  it("parses loadmore entries and next page", async () => {
    const result = await parsePage(createResponse(pageOneHtml));

    expect(result.entries).toHaveLength(2);
    expect(result.nextPageURL).toBe(SECOND_PAGE_URL);
    expect(result.entries[0]).toEqual({
      id: "https://www.cmjornal.pt/tv-media/detalhe/story-one",
      link: "https://www.cmjornal.pt/tv-media/detalhe/story-one",
      title: "Story One",
      text: "Lead one",
      datetime: new Date("2026-03-18T19:59:00.000Z"),
      imageURL: "https://cdn.cmjornal.pt/images/story-one.jpg",
    });
    expect(result.entries[1]).toEqual({
      id: "https://www.cmjornal.pt/sociedade/detalhe/story-two",
      link: "https://www.cmjornal.pt/sociedade/detalhe/story-two",
      title: 'Story Two "Premium"',
      text: 'Story Two "Premium"',
      datetime: new Date("2026-03-17T13:07:00.000Z"),
      imageURL: undefined,
    });
  });

  it("fetches only the first two loadmore pages", async () => {
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
    expect(result.id).toBe("https://www.cmjornal.pt/tv-media");
    expect(result.link).toBe("https://www.cmjornal.pt/tv-media");
    expect(result.title).toBe("CM Jornal - TV Media");
    expect(result.description).toBe("CM Jornal TV Media");
    expect(result.language).toBe("pt");
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Story One",
      'Story Two "Premium"',
      "Story Three",
      "Story Four",
    ]);
    expect(result.entries[2]?.text).toBe("Lead three");
    expect(result.entries[3]?.text).toBe("Story Four");
  });

  it("retries retryable failures while loading a page", async () => {
    const fetchCalls: string[] = [];
    let firstPageAttempts = 0;
    const fetchFn: typeof fetch = async (input) => {
      const url = readFetchUrl(input);
      fetchCalls.push(url);

      if (url === FIRST_PAGE_URL) {
        firstPageAttempts += 1;

        if (firstPageAttempts === 1) {
          throw { retryable: true };
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
