import { describe, it, expect } from "vitest";
import { parse as parseValibot } from "valibot";
import { BaremeRadioRankPayloadSchema, parse, parseWaveDate } from "./marktestBaremeRadioRank";
import json from "./__fixtures__/marktest-bareme-radio-rank.json";

describe("marktestBaremeRadioRank scraper", () => {
  const result = parse(parseValibot(BaremeRadioRankPayloadSchema, json));

  it("returns feed metadata", () => {
    expect(result.id).toBe("https://www.marktest.com/BaremeRadioRank/");
    expect(result.link).toBe("https://www.marktest.com/BaremeRadioRank/");
    expect(result.title).toBe("Marktest Bareme Rádio RANK");
    expect(result.language).toBe("pt");
  });

  it("creates one entry per wave, newest first", () => {
    expect(result.entries.length).toBe(6);

    const entry = result.entries[0];
    expect(entry.title).toBe("Bareme Rádio RANK - Vaga de Setembro 2026 (Mai-Set)");
    expect(entry.id).toBe("https://www.marktest.com/BaremeRadioRank/#Setembro%202026%20(Mai-Set)");
    expect(entry.link).toBe(entry.id);
    expect(entry.datetime).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(result.entries.at(-1)?.title).toBe(
      "Bareme Rádio RANK - Vaga de Setembro 2025 (Mai-Set)",
    );
  });

  it("ranks stations by weekly reach and lists summary rows last", () => {
    const text = result.entries[0].text ?? "";

    expect(text).toContain("<td>1</td><td>R.Comercial</td><td>39.0</td><td>19.1</td><td>25.9</td>");
    expect(text).toContain("<td>2</td><td>RFM</td><td>35.7</td>");
    expect(text).toContain("<td>-</td><td>Total Rádio</td><td>82.7</td>");
    expect(text.indexOf("Total Rádio")).toBeGreaterThan(text.indexOf("R.Comercial"));
    expect(text).toContain("<td>1</td><td>Grupo Bauer Media Audio Portugal</td><td>53.4</td>");
  });

  it("parses Portuguese wave dates", () => {
    expect(parseWaveDate("Março 2026 (Nov-Mar)")).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(parseWaveDate("Unknown 2026")).toBeUndefined();
  });
});
