import { describe, it, expect } from "vitest";
import { parse } from "./fundoAmbiental";
import html from "./__fixtures__/fundo-ambiental.html";

describe("fundoAmbiental scraper", () => {
  it("parses news from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.fundoambiental.pt/listagem-noticias.aspx");
    expect(result.link).toBe("https://www.fundoambiental.pt/listagem-noticias.aspx");
    expect(result.title).toBe("Fundo Ambiental – Últimas notícias");
    expect(result.language).toBe("pt");
  });

  it("extracts all required fields from entries", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("resolves relative entry links", async () => {
    const response = new Response(`
      <article class="register">
        <h2 class="register-title"><a href="noticia.aspx?id=1">Test news</a></h2>
        <p class="register-text">Test body</p>
        <time class="register-date">28-08-2026</time>
      </article>
    `);

    const result = await parse(response);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe("noticia.aspx?id=1");
    expect(result.entries[0]?.link).toBe("https://www.fundoambiental.pt/noticia.aspx?id=1");
  });
});
