import { describe, it, expect } from "vitest";
import { parse } from "./informacaoLisboaAgenda";
import json from "./__fixtures__/informacao-lisboa-agenda.json";

describe("informacaoLisboaAgenda parser", () => {
  it("parses events from JSON", async () => {
    const result = await parse(json);

    expect(result.id).toBe("https://informacao.lisboa.pt");
    expect(result.link).toBe("https://informacao.lisboa.pt");
    expect(result.title).toBe("Informação Lisboa Agenda");
    expect(result.language).toBe("pt");
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("extracts all required fields from entries", async () => {
    const result = await parse(json);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.link).toContain("https://informacao.lisboa.pt/agenda/o-que-fazer/");
    }
  });
});
