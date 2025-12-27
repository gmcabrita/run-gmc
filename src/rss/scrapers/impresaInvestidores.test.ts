import { describe, it, expect } from "vitest";
import { parse } from "./impresaInvestidores";
import html from "./__fixtures__/impresa-investidores.html";

describe("impresaInvestidores scraper", () => {
  it("parses investor news from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.impresa.pt/pt/investidores");
    expect(result.link).toBe("https://www.impresa.pt/pt/investidores");
    expect(result.title).toBe("Impresa – Investidores");
    expect(result.description).toBe("Impresa – Investidores");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBeTruthy();
    expect(firstEntry.link).toBeTruthy();
    expect(firstEntry.title).toBeTruthy();
    expect(firstEntry.datetime).toBeInstanceOf(Date);
  });

  it("extracts all entries from the page", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // Verify each entry has required fields
    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });
});
