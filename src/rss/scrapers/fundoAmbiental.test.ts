import { describe, it, expect } from "vitest";
import { parse } from "./fundoAmbiental";
import html from "./__fixtures__/fundo-ambiental.html";

describe("fundoAmbiental scraper", () => {
  it("parses news from HTML", async () => {
    const result = await parse(html);

    expect(result.id).toBe("https://www.fundoambiental.pt/listagem-noticias.aspx");
    expect(result.link).toBe("https://www.fundoambiental.pt/listagem-noticias.aspx");
    expect(result.title).toBe("Fundo Ambiental – Últimas notícias");
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
