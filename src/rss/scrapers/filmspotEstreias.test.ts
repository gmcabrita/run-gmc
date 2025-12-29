import { describe, it, expect } from "vitest";
import { parse } from "./filmspotEstreias";
import html from "./__fixtures__/filmspot-estreias.html";

describe("filmspotEstreias scraper", () => {
  it("parses movies from HTML", async () => {
    // Use a far future date to include all movies
    const result = await parse(html, "99991231");

    expect(result.id).toBe("https://filmspot.pt/estreias");
    expect(result.link).toBe("https://filmspot.pt/estreias");
    expect(result.title).toBe("filmSPOT – Próximas estreias");
    expect(result.language).toBe("pt");
  });

  it("extracts all required fields from entries", async () => {
    const result = await parse(html, "99991231");

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
      expect(entry.link).toContain("https://filmspot.pt");
    }
  });
});
