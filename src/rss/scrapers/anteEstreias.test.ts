import { describe, it, expect } from "vitest";
import { parse } from "./anteEstreias";
import xml from "./__fixtures__/ante-estreias.xml";

describe("anteEstreias scraper", () => {
  it("parses movie links from XML", async () => {
    const result = await parse(xml);

    expect(result.id).toBe("https://ante-estreias.blogs.sapo.pt");
    expect(result.link).toBe("https://ante-estreias.blogs.sapo.pt");
    expect(result.title).toBe("Ante-Estreias Cinema");
    expect(result.language).toBe("pt");
  });

  it("extracts external URLs only", async () => {
    const result = await parse(xml);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.link).not.toContain("ante-estreias.blogs.sapo.pt");
    }
  });
});
