import { describe, expect, it } from "vitest";
import json from "./__fixtures__/berserk.json";
import { parse } from "./berserk";

describe("berserk parser", () => {
  it("parses MangaDex chapters and includes the scanlation group", () => {
    const result = parse(json);

    expect(result).toMatchObject({
      id: "https://mangadex.org/title/801513ba-a712-498c-8f57-cae55b38cc92/berserk",
      link: "https://mangadex.org/title/801513ba-a712-498c-8f57-cae55b38cc92/berserk",
      title: "Berserk chapters",
      description: "English Berserk chapter releases from MangaDex",
      language: "en",
    });
    expect(result.entries).toHaveLength(2);

    expect(result.entries[0]).toEqual({
      id: "a8a25d77-245f-4b35-9a24-b831e27e090e",
      link: "https://mangadex.org/chapter/a8a25d77-245f-4b35-9a24-b831e27e090e",
      title:
        "Berserk — Chapter 386: Can You Catch Hold of a Migrating Bird in the Clouds? — Evil Genius",
      text: "<strong>Scanlation group:</strong> Evil Genius<br><strong>Chapter:</strong> 386<br>Can You Catch Hold of a Migrating Bird in the Clouds?",
      datetime: new Date("2026-07-09T22:35:41+00:00"),
    });
  });

  it("includes volume details when present", () => {
    const result = parse(json);

    expect(result.entries[1].text).toBe(
      "<strong>Scanlation group:</strong> Evil Genius<br><strong>Volume:</strong> 43<br><strong>Chapter:</strong> 382<br>Tomb",
    );
  });

  it("returns no entries for an invalid response", () => {
    expect(parse({ data: "invalid" }).entries).toEqual([]);
  });
});
