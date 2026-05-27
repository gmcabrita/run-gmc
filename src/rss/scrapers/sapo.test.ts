import { describe, it, expect } from "vitest";
import { parse } from "./sapo";
import xml from "./__fixtures__/sapo.xml";

describe("sapo scraper", () => {
  it("parses feed metadata from XML", async () => {
    const result = await parse(xml);

    expect(result.id).toBe("https://sapo.pt/");
    expect(result.link).toBe("https://sapo.pt/");
    expect(result.title).toContain("SAPO");
    expect(result.language).toBe("pt");
    expect(result.description).toContain("Destaques editoriais");
  });

  it("maps items to RSS entries with images", async () => {
    const result = await parse(xml);

    expect(result.entries.length).toBe(2);

    const first = result.entries[0];
    expect(first.title).toContain("cúpula de calor");
    expect(first.link).toContain("sapo.pt/artigo/");
    expect(first.id).toBe(first.link);
    expect(first.text).toContain("temperaturas máximas");
    expect(first.datetime).toBeInstanceOf(Date);
    expect(first.imageURL).toContain("thumbs.web.sapo.io");

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
    }
  });
});
