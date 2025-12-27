import { describe, it, expect } from "vitest";
import { parse } from "./ercNoticias";
import html from "./__fixtures__/erc-noticias.html";

describe("ercNoticias scraper", () => {
  it("parses news from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.erc.pt/pt/a-erc/noticias/");
    expect(result.link).toBe("https://www.erc.pt/pt/a-erc/noticias/");
    expect(result.title).toBe("Noticias ERC");
    expect(result.description).toBe("Noticias ERC");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://www.erc.pt/pt/a-erc/noticias/");
    expect(firstEntry.link).toContain("https://www.erc.pt/pt/a-erc/noticias/");
    expect(firstEntry.title).toBeTruthy();
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
    }
  });
});
