import { describe, it, expect } from "vitest";
import { parse } from "./dentsuNewsReleases";
import html from "./__fixtures__/dentsu-news-releases.html";

describe("dentsuNewsReleases scraper", () => {
  it("parses news releases from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.group.dentsu.com/en/news/release");
    expect(result.link).toBe("https://www.group.dentsu.com/en/news/release");
    expect(result.title).toBe("News Releases - Dentsu Group Inc.");
    expect(result.description).toBe("News Releases from Dentsu Group");
    expect(result.language).toBe("en");

    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("extracts all entries from the page", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // The fixture contains 5 articles
    expect(result.entries.length).toBe(5);

    // Verify each entry has required fields
    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("parses first entry correctly", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe(
      "https://www.group.dentsu.com/en/news/release/001593.html",
    );
    expect(firstEntry.link).toBe(
      "https://www.group.dentsu.com/en/news/release/001593.html",
    );
    expect(firstEntry.title).toContain("Yasuharu Sasaki");
    expect(firstEntry.title).toContain("Dubai Lynx Awards 2026");
  });

  it("handles external links correctly", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // The fifth entry has an external link
    const externalEntry = result.entries[4];
    expect(externalEntry.link).toBe(
      "https://www.dentsu.com/news-releases/dentsu-unveils-key-2026-media-trends-human-truths-in-the-algorithmic-era",
    );
    expect(externalEntry.title).toContain("2026 Media Trends");
  });

  it("handles PDF links correctly", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // The fourth entry is a PDF link
    const pdfEntry = result.entries[3];
    expect(pdfEntry.link).toBe(
      "https://www.group.dentsu.com/en/news/release/pdf-cms/2025059-1114en.pdf",
    );
  });

  it("parses dates with extra whitespace correctly", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    // Third entry has "Dec  2, 2025" (extra space for single-digit day)
    const thirdEntry = result.entries[2];
    expect(thirdEntry.datetime?.getFullYear()).toBe(2025);
    expect(thirdEntry.datetime?.getMonth()).toBe(11); // December is month 11 (0-indexed)
    expect(thirdEntry.datetime?.getDate()).toBe(2);
  });
});
