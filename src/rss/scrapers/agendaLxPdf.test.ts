import { describe, it, expect } from "vitest";
import { parse } from "./agendaLxPdf";
import html from "./__fixtures__/agendalx.html";

describe("agendaLxPdf scraper", () => {
  it("parses PDF links from HTML", async () => {
    const response = new Response(html, {
      headers: { "content-type": "text/html" },
    });
    const result = await parse(response);

    expect(result.id).toBe("https://www.agendalx.pt");
    expect(result.link).toBe("https://www.agendalx.pt");
    expect(result.title).toBe("AgendaLX");
    expect(result.language).toBe("pt");
  });

  it("extracts PDF links", async () => {
    const response = new Response(html, {
      headers: { "content-type": "text/html" },
    });
    const result = await parse(response);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toContain(".pdf");
      expect(entry.title).toBeTruthy();
    }
  });
});
