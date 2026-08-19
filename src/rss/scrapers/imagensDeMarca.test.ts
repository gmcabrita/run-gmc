import { describe, it, expect } from "vitest";
import { parse } from "./imagensDeMarca";
import json from "./__fixtures__/imagens-de-marca.json";

describe("imagensDeMarca parser", () => {
  it("parses posts from JSON", async () => {
    const result = await parse(json);

    expect(result.id).toBe("https://www.imagensdemarca.pt/");
    expect(result.link).toBe("https://www.imagensdemarca.pt/");
    expect(result.title).toBe("Imagens de Marca");
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
      expect(entry.link).toContain("https://www.imagensdemarca.pt/artigo/");
    }
  });

  it("excludes posts with invalid publication dates", async () => {
    const result = await parse({
      items: [
        {
          id: "invalid-date",
          _title: { all: "Invalid date" },
          _slug: { all: "invalid-date" },
          image_cHyPyUtO1f: null,
          image_cSyfYQnEab: null,
          image_crJeRfSWfz: null,
          datetime_cB1vB7YcXz: "not-a-date",
        },
      ],
    });

    expect(result.entries).toEqual([]);
  });
});
