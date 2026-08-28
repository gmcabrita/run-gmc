import { describe, expect, it } from "vitest";
import html from "./__fixtures__/ft-media.html";
import { parse, scrape } from "./ftMedia";

const relayEnv = {
  HTTP_RELAY_TOKEN: "relay-token",
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
};

const failedFetcher: typeof fetch = async () => new Response("Forbidden", { status: 403 });

describe("ftMedia scraper", () => {
  it("parses only articles in the FT media stream", () => {
    const result = parse(html);

    expect(result).toMatchObject({
      description: "Media news, analysis and opinion from the Financial Times",
      id: "https://www.ft.com/media",
      language: "en",
      link: "https://www.ft.com/media",
      title: "Financial Times - Media",
    });
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.title)).toStrictEqual([
      "Lex. The experience economy is a blockbuster phenomenon",
      "US press groups sue Trump over fast access to Truth Social posts",
    ]);
  });

  it("extracts canonical links, standfirsts, dates, and lazy-loaded images", () => {
    const result = parse(html);

    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-08-15T04:00:31.933Z"),
      id: "https://www.ft.com/content/0db6a598-687b-4e6c-9ff8-c1b1f858a5a0",
      imageURL: "https://images.ft.com/v3/image/raw/story.jpg?source=next&width=240",
      link: "https://www.ft.com/content/0db6a598-687b-4e6c-9ff8-c1b1f858a5a0",
      text: "Live shared experiences are increasingly popular & profitable",
      title: "Lex. The experience economy is a blockbuster phenomenon",
    });
    expect(result.entries[1].link).toBe(
      "https://www.ft.com/content/3309f3ea-c633-4727-887b-540a929d63e7",
    );
    expect(result.entries[1].text).toBe(result.entries[1].title);
  });

  it("fetches through the relay with browser navigation headers", async () => {
    let relayRequest: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      relayRequest = new Request(input, init);
      return new Response(html);
    };

    const result = await scrape(relayEnv, fetcher);

    expect(result.entries).toHaveLength(2);
    expect(relayRequest?.url).toBe(
      "https://relay.example.com/fetch/https://www.ft.com/media",
    );
    expect(relayRequest?.headers.get("Authorization")).toBe("Bearer relay-token");
    expect(relayRequest?.headers.get("Sec-Fetch-Mode")).toBe("navigate");
    expect(relayRequest?.headers.get("Sec-CH-UA")).toContain('"Google Chrome";v="146"');
    expect(relayRequest?.headers.get("Accept-Language")).toBe("en-GB,en;q=0.9");
  });

  it("reports FT request failures", async () => {
    await expect(scrape(relayEnv, failedFetcher)).rejects.toThrow("FT media request failed: 403");
  });

  it("rejects pages without the media stream", () => {
    expect(() => parse("<html></html>")).toThrow("Missing FT media stream");
  });
});
