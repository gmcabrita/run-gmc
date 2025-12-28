import { describe, it, expect } from "vitest";
import { parse } from "./impresaComunicados";
import html from "./__fixtures__/impresa-comunicados.html";

describe("impresaComunicados scraper", () => {
  it("parses comunicados from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.impresa.pt/pt/comunicados");
    expect(result.link).toBe("https://www.impresa.pt/pt/comunicados");
    expect(result.title).toBe("Impresa – Comunicados");
    expect(result.description).toBe("Impresa – Comunicados");
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

  it("correctly parses entry details", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // Check specific entry details from our fixture
    expect(result.entries.length).toBe(3);

    const firstEntry = result.entries[0];
    expect(firstEntry.link).toContain("sdistribution.impresa.pt");
    expect(firstEntry.title).toContain("Impresa");
    expect(firstEntry.datetime?.toISOString()).toBe("2025-12-28T21:32:43.000Z");
  });
});
