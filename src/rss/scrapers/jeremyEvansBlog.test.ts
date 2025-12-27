import { describe, it, expect } from "vitest";
import { parse } from "./jeremyEvansBlog";
import html from "./__fixtures__/jeremy-evans.html";

describe("jeremyEvansBlog scraper", () => {
  it("parses blog posts from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://code.jeremyevans.net/");
    expect(result.link).toBe("https://code.jeremyevans.net/");
    expect(result.title).toBe("Jeremy Evans");
    expect(result.description).toBe("Jeremy Evans");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://code.jeremyevans.net/");
    expect(firstEntry.link).toContain("https://code.jeremyevans.net/");
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
