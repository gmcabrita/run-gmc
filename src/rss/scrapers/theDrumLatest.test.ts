import { describe, it, expect } from "vitest";
import { parse, parseReleaseDate } from "./theDrumLatest";
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
