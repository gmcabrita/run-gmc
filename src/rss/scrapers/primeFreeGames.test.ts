import { describe, it, expect } from "vitest";
import { parse } from "./primeFreeGames";
import json from "./__fixtures__/prime-free-games.json";

describe("primeFreeGames json parser", () => {
  it("parses games from JSON", () => {
    const result = parse(json);

    expect(result.id).toBe("https://gaming.amazon.com/home");
    expect(result.link).toBe("https://gaming.amazon.com/home");
    expect(result.title).toBe("Free games: Prime Gaming");
    expect(result.description).toBe("Free games from Prime Gaming");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBe(3);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("game-001");
    expect(firstEntry.link).toBe("https://gaming.amazon.com/game/test-game-one");
    expect(firstEntry.title).toBe("Test Game One");
    expect(firstEntry.text).toBe("Test Game One");
    expect(firstEntry.datetime).toEqual(new Date("2025-12-25T00:00:00Z"));
  });

  it("extracts all required fields from entries", () => {
    const result = parse(json);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("filters out games with missing title or link", () => {
    const jsonWithInvalid = {
      data: {
        games: {
          items: [
            {
              assets: {
                id: "valid-game",
                title: "Valid Game",
                externalClaimLink: "https://example.com/game",
              },
              offers: [{ startTime: "2025-12-25T00:00:00Z" }],
            },
            {
              assets: {
                id: "missing-title",
                title: null as unknown as string,
                externalClaimLink: "https://example.com/game2",
              },
              offers: [{ startTime: "2025-12-25T00:00:00Z" }],
            },
            {
              assets: {
                id: "missing-link",
                title: "No Link Game",
                externalClaimLink: null as unknown as string,
              },
              offers: [{ startTime: "2025-12-25T00:00:00Z" }],
            },
          ],
        },
      },
    };

    const result = parse(jsonWithInvalid);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].id).toBe("valid-game");
  });
});
