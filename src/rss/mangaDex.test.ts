import { describe, expect, it } from "vitest";
import json from "./scrapers/__fixtures__/berserk.json";
import { buildMangaDexFeedUrl, parseMangaDexFeed, type MangaDexFeedConfig } from "./mangaDex";

const config = {
  excludedGroupIds: ["48d8a115-31b6-462f-a0db-04cc09846453"],
  language: "en",
  limit: 10,
  mangaId: "801513ba-a712-498c-8f57-cae55b38cc92",
  mangaSlug: "berserk",
  mangaTitle: "Berserk",
} satisfies MangaDexFeedConfig;

describe("buildMangaDexFeedUrl", () => {
  it("builds a MangaDex chapter feed request", () => {
    const url = new URL(buildMangaDexFeedUrl(config));

    expect(url.origin).toBe("https://api.mangadex.org");
    expect(url.pathname).toBe("/manga/801513ba-a712-498c-8f57-cae55b38cc92/feed");
    expect(url.searchParams.getAll("translatedLanguage[]")).toEqual(["en"]);
    expect(url.searchParams.getAll("excludedGroups[]")).toEqual([
      "48d8a115-31b6-462f-a0db-04cc09846453",
    ]);
    expect(url.searchParams.getAll("includes[]")).toEqual(["scanlation_group", "manga"]);
    expect(url.searchParams.getAll("contentRating[]")).toEqual([
      "safe",
      "suggestive",
      "erotica",
      "pornographic",
    ]);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("order[volume]")).toBe("desc");
    expect(url.searchParams.get("order[chapter]")).toBe("desc");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("includeUnavailable")).toBe("0");
  });
});

describe("parseMangaDexFeed", () => {
  it("applies reusable manga metadata", () => {
    const result = parseMangaDexFeed(json, {
      ...config,
      mangaId: "another-manga-id",
      mangaSlug: undefined,
      mangaTitle: "Another Manga",
    });

    expect(result.id).toBe("https://mangadex.org/title/another-manga-id");
    expect(result.title).toBe("Another Manga chapters");
    expect(result.description).toBe("Another Manga chapter releases from MangaDex");
    expect(result.entries[0].title).toContain("Another Manga — Chapter 386");
    expect(result.entries[0].title).toContain("Evil Genius");
  });

  it("keeps chapters with malformed optional fields", () => {
    const result = parseMangaDexFeed(
      {
        data: [
          {
            attributes: {
              chapter: "7",
              publishAt: false,
              title: { invalid: true },
              volume: 42,
            },
            id: "chapter-id",
            relationships: [],
          },
        ],
      },
      config,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      datetime: undefined,
      id: "chapter-id",
      title: "Berserk — Chapter 7 — Unknown scanlation group",
    });
  });
});
