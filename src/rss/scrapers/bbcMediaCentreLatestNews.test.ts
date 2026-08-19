import { describe, expect, it } from "vitest";
import { parse } from "./bbcMediaCentreLatestNews";
import json from "./__fixtures__/bbc-media-centre-latest-news.json";

describe("bbcMediaCentreLatestNews parser", () => {
  it("parses BBC Media Centre latest news articles", () => {
    const result = parse(json);

    expect(result.id).toBe("https://www.bbc.co.uk/mediacentre/latestnews");
    expect(result.link).toBe("https://www.bbc.co.uk/mediacentre/latestnews");
    expect(result.title).toBe("BBC Media Centre - Latest News");
    expect(result.description).toBe("BBC Media Centre latest news");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(2);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe(
      "ipages-media-centre:page-standard-asian-network-represents-announces-new-presenters-230326142951",
    );
    expect(firstEntry.link).toBe(
      "https://www.bbc.co.uk/mediacentre/2026/asian-network-represents-new-presenters",
    );
    expect(firstEntry.title).toBe("Asian Network Represents announces new presenters");
    expect(firstEntry.text).toBe(
      "BBC Asian Network welcomes 12 brand new presenter to host Asian Network Represents from April 2026 to March 2027",
    );
    expect(firstEntry.datetime).toEqual(new Date("2026-03-24T11:00:00.000Z"));
    expect(firstEntry.imageURL).toBe("https://ichef.bbci.co.uk/images/ic/$recipe/p0n8b7sf.jpg");
  });

  it("filters invalid or future entries and falls back to title text", () => {
    const result = parse(json);

    expect(result.entries.find((entry) => entry.id === "future-entry")).toBeUndefined();
    expect(result.entries.find((entry) => entry.id === "missing-link")).toBeUndefined();

    const fallbackEntry = result.entries.find((entry) => entry.id === "fallback-description");
    expect(fallbackEntry).toBeDefined();
    expect(fallbackEntry?.text).toBe("Fallback title");
    expect(fallbackEntry?.imageURL).toBe("https://www.bbc.co.uk/images/fallback.jpg");
  });

  it("keeps articles with malformed optional fields", () => {
    const result = parse({
      hits: {
        hits: [
          {
            _id: "tolerant-entry",
            _source: {
              fullUrl: 42,
              url: "/mediacentre/tolerant-entry",
              name: "Tolerant entry",
              description: { invalid: true },
              imageUrl: false,
              originalDate: ["invalid"],
              modifiedDate: "2025-01-01T12:00:00Z",
            },
          },
        ],
      },
    });

    expect(result.entries).toEqual([
      {
        id: "tolerant-entry",
        link: "https://www.bbc.co.uk/mediacentre/tolerant-entry",
        title: "Tolerant entry",
        text: "Tolerant entry",
        datetime: new Date("2025-01-01T12:00:00Z"),
        imageURL: undefined,
      },
    ]);
  });
});
