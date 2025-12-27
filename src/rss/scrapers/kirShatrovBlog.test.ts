import { describe, it, expect } from "vitest";
import { parse } from "./kirShatrovBlog";
import html from "./__fixtures__/kir-shatrov.html";

describe("kirShatrovBlog scraper", () => {
  it("parses blog posts from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://kirshatrov.com/posts/");
    expect(result.link).toBe("https://kirshatrov.com/posts/");
    expect(result.title).toBe("Kir Shatrov");
    expect(result.description).toBe("Kir Shatrov");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://kirshatrov.com/posts/");
    expect(firstEntry.link).toContain("https://kirshatrov.com/posts/");
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
