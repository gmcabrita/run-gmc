import { describe, it, expect } from "vitest";
import { parse } from "./uciPromocoes";
import json from "./__fixtures__/uci-promocoes.json";

describe("uciPromocoes json parser", () => {
  it("parses promotions from JSON", () => {
    const result = parse(json);

    expect(result.id).toBe("https://www.ucicinemas.pt/promocoes/");
    expect(result.link).toBe("https://www.ucicinemas.pt/promocoes/");
    expect(result.title).toBe("UCI Cinemas - Promoções");
    expect(result.description).toBe("Promoções UCI Cinemas Portugal");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("14951");
    expect(firstEntry.link).toBe(
      "https://www.ucicinemas.pt/promocoes/estreias-warner-bros-2026/",
    );
    expect(firstEntry.title).toBe(
      "Estreias Warner Bros 2026 | Habilite-se a ganhar um ano de cinema grátis!",
    );
    expect(firstEntry.text).toBe(
      "Diga-nos que filme da Warner Bros tem mais vontade de ver em 2026 e habilite-se a ganhar um cartão com um ano de cinema!",
    );
    expect(firstEntry.imageURL).toBe(
      "https://www.ucicinemas.pt/media/w4bhfrae/estreias-warner-bros-2026_800x400_pt_no-copy.jpg?width=370&height=184&v=1dc6de402940b60",
    );
    expect(firstEntry.datetime).toEqual(new Date("2025-12-15T15:26:49+00:00"));
  });

  it("uses header as title when available, falls back to name", () => {
    const result = parse(json);

    // First entry has header, should use header
    expect(result.entries[0].title).toBe(
      "Estreias Warner Bros 2026 | Habilite-se a ganhar um ano de cinema grátis!",
    );
  });

  it("strips HTML tags from introText", () => {
    const result = parse(json);

    // All entries should have plain text without HTML tags
    for (const entry of result.entries) {
      expect(entry.text).not.toContain("<p>");
      expect(entry.text).not.toContain("</p>");
      expect(entry.text).not.toContain("<strong>");
      expect(entry.text).not.toContain("</strong>");
    }
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

  it("constructs correct image URLs", () => {
    const result = parse(json);

    const entryWithImage = result.entries.find((e) => e.imageURL);
    expect(entryWithImage?.imageURL).toMatch(/^https:\/\/www\.ucicinemas\.pt\//);
  });
});
