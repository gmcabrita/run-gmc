import { describe, it, expect } from "vitest";
import { parse, parseCardDate } from "./clubeDaCriatividadeNoticias";
import html from "./__fixtures__/clube-da-criatividade-noticias.html";

async function parseFixture() {
  return parse(new Response(html, { headers: { "Content-Type": "text/html" } }));
}

describe("clubeDaCriatividadeNoticias scraper", () => {
  it("returns feed metadata", async () => {
    const result = await parseFixture();

    expect(result.id).toBe("https://www.clubedacriatividade.pt/lista-de-noticias/");
    expect(result.link).toBe("https://www.clubedacriatividade.pt/lista-de-noticias/");
    expect(result.title).toBe("Clube da Criatividade - Notícias");
    expect(result.language).toBe("pt");
  });

  it("parses every news card on the page", async () => {
    const result = await parseFixture();

    expect(result.entries.length).toBe(12);
    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-10-16T00:00:00Z"),
      id: "https://www.clubedacriatividade.pt/noticia/2026-lista-a-liderada-por-judite-mota-e-joao-madeira-candidata-se-a-direcao-do-ccp-para-o-bienio-2026-2028/",
      imageURL: "https://img.bndlyr.com/nr1dxae7lw/_assets/2028_noticias.jpg?fit=fill&w=800",
      link: "https://www.clubedacriatividade.pt/noticia/2026-lista-a-liderada-por-judite-mota-e-joao-madeira-candidata-se-a-direcao-do-ccp-para-o-bienio-2026-2028/",
      text: "O Clube da Criatividade de Portugal realiza, no próximo dia 22 de outubro, as eleições para a Direção e Órgãos Sociais do...",
      title:
        "LISTA A, liderada por Judite Mota e João Madeira, candidata-se à Direção do CCP para o biénio 2026-2028",
    });
  });

  it("decodes HTML entities in titles", async () => {
    const result = await parseFixture();

    expect(result.entries.map((entry) => entry.title)).toContain(
      "Portugal entre os finalistas nos ADCE Student Awards' 26",
    );
  });

  it("gives every entry a date", async () => {
    const result = await parseFixture();

    for (const entry of result.entries) {
      expect(entry.datetime).toBeInstanceOf(Date);
    }
    expect(result.entries.at(-1)?.datetime).toEqual(new Date("2026-09-25T00:00:00Z"));
  });

  it("returns undefined for an unknown month", () => {
    expect(parseCardDate(["1", "Foo", "2026"])).toBeUndefined();
  });
});
