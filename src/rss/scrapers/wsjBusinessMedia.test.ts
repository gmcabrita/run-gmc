import { describe, expect, it } from "vitest";
import xml from "./__fixtures__/wsj-business-media.xml";
import { parse, scrape } from "./wsjBusinessMedia";

describe("wsjBusinessMedia scraper", () => {
  it("filters the WSJ Business feed to media article paths", () => {
    const result = parse(xml);

    expect(result).toMatchObject({
      id: "https://www.wsj.com/business/media",
      link: "https://www.wsj.com/business/media",
      title: "WSJ - Business Media",
      description: "Media news and analysis from The Wall Street Journal",
      language: "en",
    });
    expect(result.entries).toHaveLength(4);
    expect(result.entries.map((entry) => entry.title)).toStrictEqual([
      "Casey Wasserman’s Talent Agency to Buy Out His Stake Using Private-Equity Financing",
      "Canada to Cease Compelling U.S. Streamers to Help Finance Domestic Broadcasting",
      "CBS News Adds Ross Douthat and Sebastian Junger to ‘60 Minutes’",
      "CMO Today Article Included in Media",
    ]);
    expect(result.entries.map((entry) => entry.link)).not.toContain(
      "https://www.wsj.com/business/not-a-media-article-87654321",
    );
    expect(
      result.entries.filter((entry) => entry.link.includes("casey-wassermans-talent-agency")),
    ).toHaveLength(1);
  });

  it("extracts canonical links, summaries, dates, and images", () => {
    const result = parse(xml);

    expect(result.entries[0]).toEqual({
      id: "https://www.wsj.com/business/media/casey-wassermans-talent-agency-to-buy-out-his-stake-using-private-equity-financing-6ca51131",
      link: "https://www.wsj.com/business/media/casey-wassermans-talent-agency-to-buy-out-his-stake-using-private-equity-financing-6ca51131",
      title: "Casey Wasserman’s Talent Agency to Buy Out His Stake Using Private-Equity Financing",
      text: "Casey Wasserman’s talent and marketing agency will buy his remaining stake using a new investment from Providence Equity Partners.",
      datetime: new Date("2026-07-29T00:12:00Z"),
      imageURL: "https://images.wsj.net/im-24657121?size=1.16",
    });
  });

  it("fetches the public Dow Jones Business feed", async () => {
    let feedRequest: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      feedRequest = new Request(input, init);
      return new Response(xml);
    };

    const result = await scrape(fetcher);

    expect(result.entries).toHaveLength(4);
    expect(feedRequest?.url).toBe(
      "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness",
    );
    expect(feedRequest?.headers.get("Accept")).toContain("application/rss+xml");
  });

  it("rejects failed feed requests", async () => {
    const fetcher: typeof fetch = async () => new Response(null, { status: 503 });

    await expect(scrape(fetcher)).rejects.toThrow("WSJ Business RSS request failed: 503");
  });

  it("rejects invalid RSS documents", () => {
    expect(() => parse("<html></html>")).toThrow("Invalid WSJ Business RSS feed");
  });
});
