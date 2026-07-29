import { describe, expect, it } from "vitest";
import html from "./__fixtures__/wsj-business-media.html";
import { parse, scrape } from "./wsjBusinessMedia";

const relayEnv = {
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
  HTTP_RELAY_TOKEN: "relay-token",
};

describe("wsjBusinessMedia scraper", () => {
  it("parses WSJ media articles from Next.js page data", () => {
    const result = parse(html);

    expect(result).toMatchObject({
      id: "https://www.wsj.com/business/media",
      link: "https://www.wsj.com/business/media",
      title: "WSJ - Business Media",
      description: "Media news and analysis from The Wall Street Journal",
      language: "en",
    });
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.title)).toStrictEqual([
      "Casey Wasserman’s Talent Agency to Buy Out His Stake Using Private-Equity Financing",
      "Canada to Cease Compelling U.S. Streamers to Help Finance Domestic Broadcasting",
      "CBS News Adds Ross Douthat and Sebastian Junger to ‘60 Minutes’",
    ]);
  });

  it("extracts canonical links, summaries, dates, and images", () => {
    const result = parse(html);

    expect(result.entries[0]).toEqual({
      id: "https://www.wsj.com/business/media/casey-wassermans-talent-agency-to-buy-out-his-stake-using-private-equity-financing-6ca51131",
      link: "https://www.wsj.com/business/media/casey-wassermans-talent-agency-to-buy-out-his-stake-using-private-equity-financing-6ca51131",
      title: "Casey Wasserman’s Talent Agency to Buy Out His Stake Using Private-Equity Financing",
      text: "Casey Wasserman’s talent and marketing agency will buy his remaining stake using a new investment from Providence Equity Partners.",
      datetime: new Date("2026-07-29T00:12:00Z"),
      imageURL: "https://images.wsj.net/im-24657121?size=1.16",
    });
  });

  it("fetches through the relay with the browser headers required by WSJ", async () => {
    let relayRequest: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      relayRequest = new Request(input, init);
      return new Response(html);
    };

    const result = await scrape(relayEnv, fetcher);

    expect(result.entries).toHaveLength(3);
    expect(relayRequest?.url).toBe(
      "https://relay.example.com/fetch/https://www.wsj.com/business/media",
    );
    expect(relayRequest?.headers.get("Authorization")).toBe("Bearer relay-token");
    expect(relayRequest?.headers.get("Cookie")).toBe('bcookie=""');
    expect(relayRequest?.headers.get("Sec-Fetch-Mode")).toBe("navigate");
    expect(relayRequest?.headers.get("Sec-CH-UA")).toContain('"Google Chrome";v="146"');
  });

  it("rejects pages without Next.js data", () => {
    expect(() => parse("<html></html>")).toThrow("Missing WSJ __NEXT_DATA__ payload");
  });
});
