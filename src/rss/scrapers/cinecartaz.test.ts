import { describe, it, expect } from "vitest";
import { parse } from "./cinecartaz";
import html from "./__fixtures__/cinecartaz.html";

describe("cinecartaz scraper", () => {
  it("parses passatempos from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://cinecartaz.publico.pt/passatempos");
    expect(result.link).toBe("https://cinecartaz.publico.pt/passatempos");
    expect(result.title).toBe("Passatempos | Cinecartaz");
    expect(result.description).toBe("Passatempos | Cinecartaz");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://cinecartaz.publico.pt/passatempos/");
    expect(firstEntry.link).toContain("https://cinecartaz.publico.pt/passatempos/");
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
