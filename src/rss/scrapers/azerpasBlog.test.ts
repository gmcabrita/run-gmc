import { describe, expect, it } from "vitest";
import { parse } from "./azerpasBlog";
import html from "./__fixtures__/azerpas-blog.html";

describe("azerpasBlog scraper", () => {
  it("parses blog posts from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://blog.azerpas.com/");
    expect(result.link).toBe("https://blog.azerpas.com/");
    expect(result.title).toBe("Anthony Manikhouth");
    expect(result.description).toBe(
      "Anthony Manikhouth — engineer writing about browser security, low-level performance, and weekend hardware experiments.",
    );
    expect(result.language).toBe("en");

    expect(result.entries).toHaveLength(5);
    expect(result.entries[0]).toEqual({
      datetime: new Date(Date.UTC(2026, 4, 18)),
      id: "https://blog.azerpas.com/writing/wasm-simd-fingerprinting",
      link: "https://blog.azerpas.com/writing/wasm-simd-fingerprinting",
      text: "2026 · May 18 · 10 min · #wasm #fingerprinting",
      title: "Fingerprinting CPUs from the Browser with WebAssembly SIMD",
    });
  });

  it("keeps external post links", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.entries[1]).toMatchObject({
      id: "https://datadome.co/threat-research/how-chromes-new-ai-web-apis-enable-hardware-fingerprinting/",
      link: "https://datadome.co/threat-research/how-chromes-new-ai-web-apis-enable-hardware-fingerprinting/",
      title: "How Chrome’s New AI Web APIs Are Enabling Hardware Fingerprinting",
    });
  });
});
