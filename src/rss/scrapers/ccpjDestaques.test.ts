import { describe, it, expect } from "vitest";
import { parse } from "./ccpjDestaques";
import html from "./__fixtures__/ccpj.html";

describe("ccpjDestaques scraper", () => {
  it("parses Destaques from homepage HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.ccpj.pt");
    expect(result.link).toBe("https://www.ccpj.pt");
    expect(result.title).toBe("CCPJ - Destaques");
    expect(result.description).toBe("CCPJ - Destaques");
    expect(result.language).toBe("pt");

    expect(result.entries).toHaveLength(2);

    const first = result.entries[0];
    expect(first.id).toBe(
      "https://www.ccpj.pt/pt/informacao/cooptacao-da-presidente-da-ccpj-para-o-trienio-20252028/",
    );
    expect(first.link).toBe(
      "https://www.ccpj.pt/pt/informacao/cooptacao-da-presidente-da-ccpj-para-o-trienio-20252028/",
    );
    expect(first.title).toBe("Cooptação da Presidente da CCPJ para o triénio 2025/2028");
    expect(first.text).toBe("<strong>Categoria:</strong> Divulgações");
    expect(first.datetime).toBeInstanceOf(Date);
  });

  it("ignores non-Destaques links on the page", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    for (const entry of result.entries) {
      expect(entry.link).toContain("https://www.ccpj.pt/pt/informacao/");
      expect(entry.title).toBeTruthy();
    }
  });
});
