import { describe, it, expect } from "vitest";
import { parse } from "./kitLangtonBlog";
import html from "./__fixtures__/kit-langton.html";

describe("kitLangtonBlog scraper", () => {
  it("parses blog posts from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.kitlangton.com/");
    expect(result.link).toBe("https://www.kitlangton.com/");
    expect(result.title).toBe("Kit Langton");
    expect(result.description).toBe("Kit Langton");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBeTruthy();
    expect(firstEntry.link).toBeTruthy();
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

  it("uses title as text instead of date", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // Verify text equals title and doesn't contain date patterns
    for (const entry of result.entries) {
      expect(entry.text).toBe(entry.title);
      expect(entry.text).not.toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    }
  });
});
