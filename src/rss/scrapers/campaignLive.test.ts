import { describe, expect, it } from "vitest";
import { mergeEntries, parseBylineDate, parseSection, scrape } from "./campaignLive";
import html from "./__fixtures__/campaign-live-section.html";

const relayEnv = {
  HTTP_RELAY_TOKEN: "relay-token",
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
};

function createResponse(): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

const failedFetcher: typeof fetch = async () => new Response(null, { status: 403 });

const emptyFetcher: typeof fetch = async () => new Response("<html></html>");

describe("campaignLive scraper", () => {
  it("parses article cards from a section page", async () => {
    const entries = await parseSection(createResponse());

    expect(entries).toEqual([
      {
        datetime: new Date("2026-09-30T00:00:00.000Z"),
        id: "https://www.campaignlive.co.uk/article/campaign-gaming-summit-returns-for-2027/4p6y2f6njzg4z2jgng3aa0h2xy",
        imageURL:
          "https://www.campaignlive.co.uk/media/mediafields/ArticleImage/first.png?width=1300&format=webp",
        link: "https://www.campaignlive.co.uk/article/campaign-gaming-summit-returns-for-2027/4p6y2f6njzg4z2jgng3aa0h2xy",
        text: "Campaign Gaming Summit returns for 2027",
        title: "Campaign Gaming Summit returns for 2027",
      },
      {
        datetime: undefined,
        id: "https://www.campaignlive.co.uk/article/sekonda-any-second-now-by-vccp-blue/4t8vnbzzmc7wp7gvb27ty779nm",
        imageURL:
          "https://www.campaignlive.co.uk/media/mediafields/ArticleImage/second.jpg?width=1300",
        link: "https://www.campaignlive.co.uk/article/sekonda-any-second-now-by-vccp-blue/4t8vnbzzmc7wp7gvb27ty779nm",
        text: "Sekonda “Any. Second. Now” by VCCP Blue",
        title: "Sekonda “Any. Second. Now” by VCCP Blue",
      },
      {
        datetime: undefined,
        id: "https://www.campaignlive.co.uk/article/nikki-chapman-joins-lucky-generals-as-chief-production-officer/4f1vrs2y7tz9g7vhg5nqy7taxh",
        imageURL: undefined,
        link: "https://www.campaignlive.co.uk/article/nikki-chapman-joins-lucky-generals-as-chief-production-officer/4f1vrs2y7tz9g7vhg5nqy7taxh",
        text: "Nikki Chapman joins Lucky Generals as chief production officer",
        title: "Nikki Chapman joins Lucky Generals as chief production officer",
      },
    ]);
  });

  it("parses byline dates", () => {
    expect(parseBylineDate("by Staff | 1 March 2026")).toEqual(
      new Date("2026-03-01T00:00:00.000Z"),
    );
    expect(parseBylineDate("by Staff")).toBeUndefined();
  });

  it("merges duplicate articles across sections", () => {
    const link = "https://www.campaignlive.co.uk/article/a/1";
    const datetime = new Date("2026-09-30T00:00:00.000Z");

    expect(
      mergeEntries([
        [{ id: link, imageURL: "https://www.campaignlive.co.uk/a.jpg", link, title: "A" }],
        [{ datetime, id: link, link, title: "A again" }],
      ]),
    ).toEqual([
      { datetime, id: link, imageURL: "https://www.campaignlive.co.uk/a.jpg", link, title: "A" },
    ]);
  });

  it("requests all four sections through the relay", async () => {
    const requests: Array<Request> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return createResponse();
    };

    const result = await scrape(relayEnv, fetchFn);

    expect(requests.map((request) => request.url)).toEqual([
      "https://relay.example.com/fetch/https://www.campaignlive.co.uk/news",
      "https://relay.example.com/fetch/https://www.campaignlive.co.uk/in-depth",
      "https://relay.example.com/fetch/https://www.campaignlive.co.uk/the-work",
      "https://relay.example.com/fetch/https://www.campaignlive.co.uk/the-knowledge",
    ]);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer relay-token");
    expect(requests[0]?.headers.get("sec-fetch-mode")).toBe("navigate");
    expect(result).toMatchObject({ id: "https://www.campaignlive.co.uk", title: "Campaign UK" });
    expect(result.entries).toHaveLength(3);
  });

  it("reports sections without articles", async () => {
    await expect(scrape(relayEnv, emptyFetcher)).rejects.toThrow(
      "Campaign section has no articles: https://www.campaignlive.co.uk/news",
    );
  });

  it("reports failed requests", async () => {
    await expect(scrape(relayEnv, failedFetcher)).rejects.toThrow(
      "Campaign request failed for https://www.campaignlive.co.uk/news: 403",
    );
  });
});
