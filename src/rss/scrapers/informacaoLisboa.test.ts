import { describe, it, expect } from "vitest";
import { parse } from "./informacaoLisboa";
import json from "./__fixtures__/informacao-lisboa.json";

describe("informacaoLisboa parser", () => {
  it("parses news from JSON", async () => {
    const result = await parse(json);

    expect(result.id).toBe("https://informacao.lisboa.pt");
    expect(result.link).toBe("https://informacao.lisboa.pt");
    expect(result.title).toBe("Informação Lisboa");
    expect(result.language).toBe("pt");
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("extracts all required fields from entries", async () => {
    const result = await parse(json);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
      expect(entry.link).toContain("https://informacao.lisboa.pt/noticias/detalhe/");
    }
  });
});
