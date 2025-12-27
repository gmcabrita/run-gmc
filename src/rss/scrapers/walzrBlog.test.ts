import { describe, it, expect } from "vitest";
import { parse } from "./walzrBlog";
import html from "./__fixtures__/walzr.html";

describe("walzrBlog scraper", () => {
  it("parses blog posts from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://walzr.com/");
    expect(result.link).toBe("https://walzr.com/");
    expect(result.title).toBe("Riley Walz");
    expect(result.description).toBe("Riley Walz");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://walzr.com/blog/");
    expect(firstEntry.link).toContain("https://walzr.com/blog/");
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
