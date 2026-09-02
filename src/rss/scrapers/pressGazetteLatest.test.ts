import { describe, expect, it } from "vitest";
import { parse, scrape } from "./pressGazetteLatest";
import html from "./__fixtures__/press-gazette-latest.html";

const BASE_URL = "https://pressgazette.co.uk/all-articles/";
const relayEnv = {
  HTTP_RELAY_TOKEN: "relay-token",
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
};

function createResponse(): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

const failedFetcher: typeof fetch = async () => new Response(null, { status: 503 });

describe("pressGazetteLatest scraper", () => {
  it("parses the latest article catalogue", async () => {
    const result = await parse(createResponse());

    expect(result).toMatchObject({
      description: "The last 100 articles published on Press Gazette",
      id: BASE_URL,
      language: "en",
      link: BASE_URL,
      title: "Latest Articles - Press Gazette",
    });
    expect(result.entries).toEqual([
      {
        id: "https://pressgazette.co.uk/news/first-story/",
        imageURL: "https://pressgazette.co.uk/wp-content/uploads/first-story.jpg",
        link: "https://pressgazette.co.uk/news/first-story/",
        text: "A detailed first-story summary…",
        title: "First story & analysis",
      },
      {
        id: "https://pressgazette.co.uk/publishers/second-story/",
        imageURL: "https://pressgazette.co.uk/wp-content/uploads/second-story.webp",
        link: "https://pressgazette.co.uk/publishers/second-story/",
        text: "Second story",
        title: "Second story",
      },
    ]);
  });

  it("requests the all-articles page", async () => {
    const requests: Array<Request> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return createResponse();
    };

    const result = await scrape(relayEnv, fetchFn);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`https://relay.example.com/fetch/${BASE_URL}?output=1`);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer relay-token");
    expect(requests[0]?.headers.get("accept")).toBe("text/html");
    expect(requests[0]?.headers.get("user-agent")).toBe("Mozilla/5.0");
    expect(result.entries).toHaveLength(2);
  });

  it("reports failed requests", async () => {
    await expect(scrape(relayEnv, failedFetcher)).rejects.toThrow(
      "Press Gazette request failed: 503",
    );
  });
});
