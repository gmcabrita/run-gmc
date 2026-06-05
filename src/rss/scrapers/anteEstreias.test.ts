import { describe, it, expect } from "vitest";
import { parse } from "./anteEstreias";
import html from "./__fixtures__/ante-estreias.html";

describe("anteEstreias scraper", () => {
  it("parses feed metadata", () => {
    const result = parse(html);

    expect(result.id).toBe("https://anteestreias.blogspot.com/search/label/-%20bilhetes%20cinema?m=0");
    expect(result.link).toBe("https://anteestreias.blogspot.com/search/label/-%20bilhetes%20cinema?m=0");
    expect(result.title).toBe("Ante-Estreias Cinema");
    expect(result.language).toBe("pt");
  });

  it("extracts external URLs only", () => {
    const result = parse(html);

    expect(result.entries.map((entry) => entry.link)).toEqual([
      "https://cinemametropolis.com/ganha-convites-masters-of-the-universe-lisboa-e-porto/",
      "https://www.instagram.com/ign_portugal/p/DYeV7OYML-k/",
      "https://cinecartaz.publico.pt/passatempos/algo-velho-algo-novo-algo-emprestado-cinemas-4-junho-415583",
    ]);
  });

  it("uses movie titles and post dates", () => {
    const result = parse(html);

    expect(result.entries[0]).toMatchObject({
      title: "Masters of The Universe",
      text: "Metropolis: https://cinemametropolis.com/ganha-convites-masters-of-the-universe-lisboa-e-porto/",
      imageURL: "https://www.passatemposportugal.com.pt/filmes/mastersoftheuniverse.gif",
      datetime: new Date("2026-06-04T08:49:00+01:00"),
    });
    expect(result.entries[2]?.title).toBe("Algo Velho, Algo Novo, Algo Emprestado​​");
  });
});
