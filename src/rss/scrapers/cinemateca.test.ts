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
  });

  it("extracts all required fields from entries", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });
});
