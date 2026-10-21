import { describe, it, expect, vi } from "vitest";
import { parse, parseReleaseDate, scrape } from "./theDrumLatest";
import html from "./__fixtures__/the-drum-latest.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("theDrumLatest scraper", () => {
  it("parses latest article cards", async () => {
    const now = new Date("2026-03-11T12:00:00Z");
    const result = await parse(createResponse(), now);

    expect(result.id).toBe("https://www.thedrum.com/latest");
    expect(result.link).toBe("https://www.thedrum.com/latest");
    expect(result.title).toBe("Latest Marketing News | The Drum");
    expect(result.description).toBe(
      "Get the latest marketing news here at The Drum. Browse the latest industry and brand news as it happens, including in-depth journalism and analysis.",
    );
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(3);
  });

  it("extracts title, link, image and parsed dates", async () => {
    const now = new Date("2026-03-11T12:00:00Z");
    const result = await parse(createResponse(), now);

    expect(result.entries[0]).toEqual({
      datetime: undefined,
      id: "https://www.thedrum.com/news/story-one",
      imageURL: "https://thedrum-media.imgix.net/story-one.jpg",
      link: "https://www.thedrum.com/news/story-one",
      text: "Story One",
      title: "Story One",
    });

    expect(result.entries[1]?.datetime).toEqual(new Date("2026-03-09T12:00:00Z"));
    expect(result.entries[1]?.imageURL).toBe("https://www.thedrum.com/images/story-two.jpg");
    expect(result.entries[2]?.datetime).toEqual(new Date("2026-03-05T00:00:00.000Z"));
    expect(result.entries[2]?.imageURL).toBeUndefined();
  });

  it("parses release labels", () => {
    const now = new Date("2026-03-11T12:00:00Z");

    expect(parseReleaseDate("New", now)).toBeUndefined();
    expect(parseReleaseDate("2 days ago", now)).toEqual(new Date("2026-03-09T12:00:00Z"));
    expect(parseReleaseDate("05 Mar 2026", now)).toEqual(new Date("2026-03-05T00:00:00.000Z"));
    expect(parseReleaseDate("sometime later", now)).toBeUndefined();
  });
});

describe("theDrumLatest scrape", () => {
  it("requests the page with the WhatsApp User-Agent", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => createResponse());

    const result = await scrape(fetcher);

    expect(result.entries).toHaveLength(3);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://www.thedrum.com/latest");
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("user-agent")).toBe("WhatsApp/2.23.20.0");
  });

  it("fails when AWS WAF returns the challenge page", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("challenge", { status: 202 }));

    await expect(scrape(fetcher)).rejects.toThrow("status 202");
  });
});
