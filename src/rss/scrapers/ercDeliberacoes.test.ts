import { describe, it, expect } from "vitest";
import { parse } from "./ercDeliberacoes";
import html from "./__fixtures__/erc-deliberacoes.html";

describe("ercDeliberacoes scraper", () => {
  it("parses deliberacoes from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/");
    expect(result.link).toBe("https://www.erc.pt/pt/deliberacoes/deliberacoes-erc/");
    expect(result.title).toBe("Deliberações ERC");
    expect(result.description).toBe("Deliberações ERC");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://www.erc.pt/document.php");
    expect(firstEntry.link).toContain("https://www.erc.pt/document.php");
    expect(firstEntry.title).toMatch(/ERC\/2025\/\d+/);
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

  it("excludes Tópicos from entry text", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // Verify no entry text contains "Tópicos:" (decoded or HTML entity encoded)
    for (const entry of result.entries) {
      expect(entry.text).not.toContain("Tópicos:");
      expect(entry.text).not.toContain("T&oacute;picos:");
    }
  });
});
