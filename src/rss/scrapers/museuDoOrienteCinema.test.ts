import { describe, it, expect } from "vitest";
import { parse } from "./museuDoOrienteCinema";
import html from "./__fixtures__/museu-do-oriente-cinema.html";

describe("museuDoOrienteCinema scraper", () => {
  it("parses cinema events from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.foriente.pt");
    expect(result.link).toBe("https://www.foriente.pt");
    expect(result.title).toBe("Museu do Oriente - Cinema");
    expect(result.language).toBe("pt");
  });

  it("only includes cinema events", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toMatch(/^https:\/\/www\.foriente\.pt\/detalhe\.php\?id=/);
      expect(entry.title).toBeTruthy();
    }
  });

  it("filters out non-cinema events", async () => {
    const htmlWithMixed = `
      <div class="grid">
        <div data-id="cinema-1" class="rectangle">
          <div class="event-container">
            <div class="event-date">Sábado | 10 Janeiro</div>
            <div class="event-title">Film Title</div>
            <div class="event-type">Ciclo de Cinema</div>
          </div>
        </div>
        <div data-id="concert-1" class="rectangle">
          <div class="event-container">
            <div class="event-date">Domingo | 11 Janeiro</div>
            <div class="event-title">Concert Title</div>
            <div class="event-type">Concerto</div>
          </div>
        </div>
      </div>
    `;
    const response = new Response(htmlWithMixed, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.entries.length).toBe(1);
    expect(result.entries[0].id).toBe("cinema-1");
    expect(result.entries[0].title).toBe("Film Title");
  });
});
