import { describe, it, expect } from "vitest";
import { parse } from "./adsOfTheWorldBlog";
import html from "./__fixtures__/ads-of-the-world.html";

describe("adsOfTheWorldBlog scraper", () => {
  it("parses campaigns from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.adsoftheworld.com/blog/feed");
    expect(result.link).toBe("https://www.adsoftheworld.com/blog/feed");
    expect(result.title).toBe("Highlighted Campaigns – Ads of the World");
    expect(result.description).toBe("Highlighted Campaigns – Ads of the World");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toContain("https://www.adsoftheworld.com/campaigns/");
    expect(firstEntry.link).toContain("https://www.adsoftheworld.com/campaigns/");
    expect(firstEntry.title).toBeTruthy();
    expect(firstEntry.imageURL).toBeTruthy();
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

  it("formats title with brand, campaign and agency", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // First entry should be "auto.rubusiness | Off to '26! | Agency: Shchi"
    const firstEntry = result.entries[0];
    expect(firstEntry.title).toBe("auto.rubusiness | Off to '26! | Agency: Shchi");
  });
});
