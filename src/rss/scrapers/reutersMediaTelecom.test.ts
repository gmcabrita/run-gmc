import { describe, expect, it } from "vitest";
import { parse } from "./reutersMediaTelecom";
import json from "./__fixtures__/reuters-media-telecom.json";

describe("reutersMediaTelecom parser", () => {
  it("parses Reuters section articles", () => {
    const result = parse(json);

    expect(result.id).toBe("https://www.reuters.com/business/media-telecom/");
    expect(result.link).toBe("https://www.reuters.com/business/media-telecom/");
    expect(result.title).toBe("Reuters - Media & Telecom");
    expect(result.description).toBe("Reuters Media & Telecom news");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(2);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("abc123");
    expect(firstEntry.link).toBe(
      "https://www.reuters.com/business/media-telecom/test-title-2026-03-09/",
    );
    expect(firstEntry.title).toBe("Test Reuters Title");
    expect(firstEntry.text).toBe("Test Reuters description.");
    expect(firstEntry.datetime).toEqual(new Date("2026-03-09T08:06:42.482Z"));
    expect(firstEntry.imageURL).toBe("https://example.com/image.jpg");
  });

  it("falls back to alternate headline and updated time", () => {
    const result = parse(json);
    const fallbackEntry = result.entries.find((entry) => entry.id === "def456");

    expect(fallbackEntry).toBeDefined();
    expect(fallbackEntry?.title).toBe("Fallback Headline");
    expect(fallbackEntry?.text).toBe("Fallback Headline");
    expect(fallbackEntry?.datetime).toEqual(new Date("2026-03-08T10:00:00Z"));
    expect(fallbackEntry?.imageURL).toBeUndefined();
  });

  it("filters articles without canonical urls", () => {
    const result = parse(json);

    expect(result.entries.find((entry) => entry.id === "ghi789")).toBeUndefined();
  });

  it("keeps articles with malformed optional fields", () => {
    const result = parse({
      result: {
        articles: [
          {
            id: "tolerant-entry",
            canonical_url: "/business/media-telecom/tolerant-entry/",
            title: 42,
            basic_headline: "Tolerant headline",
            description: { invalid: true },
            published_time: false,
            updated_time: "2025-01-01T12:00:00Z",
            thumbnail: { url: 99 },
          },
        ],
      },
    });

    expect(result.entries).toEqual([
      {
        id: "tolerant-entry",
        link: "https://www.reuters.com/business/media-telecom/tolerant-entry/",
        title: "Tolerant headline",
        text: "Tolerant headline",
        datetime: new Date("2025-01-01T12:00:00Z"),
        imageURL: undefined,
      },
    ]);
  });
});
