import { describe, it, expect } from "vitest";
import { parse } from "./cinemateca";
import html from "./__fixtures__/cinemateca.html";

describe("cinemateca scraper", () => {
  it("parses screenings from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.cinemateca.pt/Programacao.aspx");
    expect(result.link).toBe("https://www.cinemateca.pt/Programacao.aspx");
    expect(result.title).toBe("Programação Cinemateca");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBe(4);
  });

  it("extracts all required fields from entries", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.entries.length).toBeGreaterThan(0);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("parses movie details correctly", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("https://www.cinemateca.pt/Programacao.aspx?id=19531&date=2026-02-02");
    expect(firstEntry.link).toBe("https://www.cinemateca.pt/Programacao.aspx?id=19531&date=2026-02-02");
    expect(firstEntry.title).toBe("LA VIE DE PLAISIR, de Albert Valentin");
    expect(firstEntry.datetime).toEqual(new Date("2026-02-02 16:30"));
    expect(firstEntry.text).toContain("Letterboxd");

    const secondEntry = result.entries[1];
    expect(secondEntry.title).toBe("RIO BRAVO, de Howard Hawks");
    expect(secondEntry.datetime).toEqual(new Date("2026-02-02 19:00"));

    const thirdEntry = result.entries[2];
    expect(thirdEntry.title).toBe("LETJAT ZURAVLI, de Mikhail Kalatozov");
    expect(thirdEntry.datetime).toEqual(new Date("2026-02-02 19:30"));

    const fourthEntry = result.entries[3];
    expect(fourthEntry.title).toBe("BLAZING SADDLES, de Mel Brooks");
    expect(fourthEntry.datetime).toEqual(new Date("2026-02-02 21:30"));
  });
});
