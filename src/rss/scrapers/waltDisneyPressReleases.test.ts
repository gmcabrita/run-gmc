import { describe, it, expect } from "vitest";
import { parse } from "./waltDisneyPressReleases";
import html from "./__fixtures__/disney-press-releases.html";

describe("waltDisneyPressReleases scraper", () => {
  it("parses press releases from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://thewaltdisneycompany.com/press-releases/");
    expect(result.link).toBe("https://thewaltdisneycompany.com/press-releases/");
    expect(result.title).toBe("Press Releases Archives - The Walt Disney Company");
    expect(result.description).toBe("Press Releases Archives - The Walt Disney Company");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe(
      "https://thewaltdisneycompany.com/the-walt-disney-company-and-openai-reach-landmark-agreement-to-bring-beloved-characters-from-across-disneys-brands-to-sora/",
    );
    expect(firstEntry.link).toBe(
      "https://thewaltdisneycompany.com/the-walt-disney-company-and-openai-reach-landmark-agreement-to-bring-beloved-characters-from-across-disneys-brands-to-sora/",
    );
    expect(firstEntry.title).toContain("OpenAI");
    expect(firstEntry.datetime).toEqual(new Date("2025-12-11T06:01:00-08:00"));
  });

  it("extracts all entries from the page", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // The fixture contains 30 articles
    expect(result.entries.length).toBe(30);

    // Verify each entry has required fields
    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("extracts datetime correctly from various entries", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // Check second entry (Jeff Williams board nomination)
    const secondEntry = result.entries[1];
    expect(secondEntry.link).toContain("jeff-williams");
    expect(secondEntry.datetime).toEqual(new Date("2025-12-09T13:19:42-08:00"));

    // Check last entry (Fubo and Disney's Hulu)
    const lastEntry = result.entries[result.entries.length - 1];
    expect(lastEntry.link).toContain("fubo");
    expect(lastEntry.datetime).toEqual(new Date("2025-01-06T05:46:21-08:00"));
  });
});
