import { describe, expect, it } from "vitest";
import { parse } from "./autoRegulacaoPublicitariaDeliberacoes";

const html = `
<article class="post_item_single">
  <div class="post_content entry-content">
    <div class="sc_blogger">
      <div class="sc_blogger_item sc_item_container">
        <div class="post_meta sc_blogger_item_meta post_meta">
          <span class="post_meta_item post_categories cat_sep">
            <a href="https://auto-regulacaopublicitaria.pt/category/2026/">2026</a>
          </span>
          <span class="post_meta_item post_date">
            <a href="https://auto-regulacaopublicitaria.pt/consulta-1j-2026-modelo-continente-vs-lidl-cia/">Maio 12, 2026</a>
          </span>
        </div>
        <h6 class="sc_blogger_item_title entry-title">
          <a href="https://auto-regulacaopublicitaria.pt/consulta-1j-2026-modelo-continente-vs-lidl-cia/" rel="bookmark">Consulta 1J/2026 – MODELO CONTINENTE vs. LIDL &amp; CIA.</a>
        </h6>
      </div>
      <div class="sc_blogger_item sc_item_container">
        <div class="post_meta sc_blogger_item_meta post_meta">
          <span class="post_meta_item post_categories cat_sep">
            <a href="https://auto-regulacaopublicitaria.pt/category/2025/">2025</a>
          </span>
          <span class="post_meta_item post_date">
            <a href="/consulta-4j-2025-modelo-continente-vs-lidl-cia/">Julho 4, 2025</a>
          </span>
        </div>
        <h6 class="sc_blogger_item_title entry-title">
          <a href="/consulta-4j-2025-modelo-continente-vs-lidl-cia/" rel="bookmark">Consulta 4J/2025 – MODELO CONTINENTE vs. LIDL &amp; CIA</a>
        </h6>
      </div>
    </div>
  </div>
</article>
`;

describe("autoRegulacaoPublicitariaDeliberacoes scraper", () => {
  it("parses deliberacoes from HTML", async () => {
    const result = await parse(
      new Response(html, {
        headers: { "Content-Type": "text/html" },
      }),
    );

    expect(result.id).toBe("https://auto-regulacaopublicitaria.pt/deliberacoes/");
    expect(result.link).toBe("https://auto-regulacaopublicitaria.pt/deliberacoes/");
    expect(result.title).toBe("Deliberações ARP");
    expect(result.description).toBe("Deliberações da Auto Regulação Publicitária");
    expect(result.language).toBe("pt");
    expect(result.entries).toHaveLength(2);
  });

  it("extracts links, titles, metadata, and dates", async () => {
    const result = await parse(
      new Response(html, {
        headers: { "Content-Type": "text/html" },
      }),
    );

    expect(result.entries[0]).toEqual({
      id: "https://auto-regulacaopublicitaria.pt/consulta-1j-2026-modelo-continente-vs-lidl-cia/",
      link: "https://auto-regulacaopublicitaria.pt/consulta-1j-2026-modelo-continente-vs-lidl-cia/",
      title: "Consulta 1J/2026 – MODELO CONTINENTE vs. LIDL & CIA.",
      text: "Ano: 2026 | Data: Maio 12, 2026",
      datetime: new Date(2026, 4, 12),
    });

    expect(result.entries[1]).toEqual({
      id: "https://auto-regulacaopublicitaria.pt/consulta-4j-2025-modelo-continente-vs-lidl-cia/",
      link: "https://auto-regulacaopublicitaria.pt/consulta-4j-2025-modelo-continente-vs-lidl-cia/",
      title: "Consulta 4J/2025 – MODELO CONTINENTE vs. LIDL & CIA",
      text: "Ano: 2025 | Data: Julho 4, 2025",
      datetime: new Date(2025, 6, 4),
    });
  });
});
