import { describe, it, expect } from "vitest";
import { parse } from "./nimas";
import html from "./__fixtures__/nimas.html";

describe("nimas scraper", () => {
  it("parses screenings from HTML", async () => {
    const result = await parse(html);

    expect(result.id).toBe("https://medeiafilmes.com/cinemas/cinema-medeia-nimas");
    expect(result.link).toBe("https://medeiafilmes.com/cinemas/cinema-medeia-nimas");
    expect(result.title).toBe("Programação Nimas");
    expect(result.language).toBe("pt");
  });

  it("extracts all required fields from entries", async () => {
    const result = await parse(html);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });
});
