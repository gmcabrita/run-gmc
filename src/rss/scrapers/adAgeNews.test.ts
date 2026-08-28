import { describe, it, expect } from "vitest";
import { parse } from "./adAgeNews";
import html from "./__fixtures__/ad-age-news.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("adAgeNews scraper", () => {
  it("parses stories from Fusion content cache", async () => {
    const now = new Date("2026-04-08T12:00:00Z");
    const result = await parse(createResponse(), now);

    expect(result.id).toBe("https://adage.com/news/");
    expect(result.link).toBe("https://adage.com/news/");
    expect(result.title).toBe("Latest News - Ad Age");
    expect(result.description).toBe("Latest News");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(2);
  });

  it("extracts title, description, image and publication date", async () => {
    const now = new Date("2026-04-08T12:00:00Z");
    const result = await parse(createResponse(), now);

    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-04-08T10:00:00.000Z"),
      id: "https://adage.com/agency-news/aa-nike-taps-new-agency-after-global-review/",
      imageURL: "https://example.com/nike.jpg",
      link: "https://adage.com/agency-news/aa-nike-taps-new-agency-after-global-review/",
      text: "Brand resets roster after monthslong pitch.",
      title: "Nike taps new agency after global review",
    });

    expect(result.entries[1]).toEqual({
      datetime: new Date("2026-04-07T14:30:00.000Z"),
      id: "https://adage.com/media/aa-how-brands-use-creators-during-playoffs/",
      imageURL: undefined,
      link: "https://adage.com/media/aa-how-brands-use-creators-during-playoffs/",
      text: "Sports marketers test new creator formats.",
      title: "How brands use creators during playoffs",
    });
  });

  it("drops invalid and future entries", async () => {
    const now = new Date("2026-04-08T12:00:00Z");
    const result = await parse(createResponse(), now);

    const links = result.entries.map((entry) => entry.link);
    expect(links).not.toContain("https://adage.com/future-story/");
    expect(links).not.toContain("https://adage.com/missing-headline/");
  });

  it("keeps stories with malformed optional fields", async () => {
    const contentCache = {
      "story-feed-sections": {
        main: {
          data: {
            content_elements: [
              {
                description: { basic: false },
                display_date: { invalid: true },
                headlines: { basic: "Tolerant story" },
                promo_items: ["invalid"],
                publish_date: "2025-01-01T12:00:00Z",
                website_url: "/tolerant-story/",
                websites: 42,
              },
            ],
          },
        },
      },
    };
    const response = new Response(
      `<script>Fusion.contentCache=${JSON.stringify(contentCache)};Fusion.lastModified=0;</script>`,
    );
    const result = await parse(response, new Date("2026-01-01T00:00:00Z"));

    expect(result.entries).toEqual([
      {
        datetime: new Date("2025-01-01T12:00:00Z"),
        id: "https://adage.com/tolerant-story/",
        imageURL: undefined,
        link: "https://adage.com/tolerant-story/",
        text: "Tolerant story",
        title: "Tolerant story",
      },
    ]);
  });
});
