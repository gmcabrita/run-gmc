import { describe, it, expect } from "vitest";
import { parse } from "./nimas";
import html from "./__fixtures__/nimas.html";

describe("nimas scraper", () => {
  it("parses screenings from HTML", async () => {
    const result = await parse(html);

    expect(result.id).toBe("https://medeiafilmes.com/cinemas/cinema-medeia-nimas");
    expect(result.link).toBe("https://medeiafilmes.com/cinemas/cinema-medeia-nimas");
    expect(result.title).toBe("Programação Nimas");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBe(4);
  });

  it("extracts all required fields from entries", async () => {
    const result = await parse(html);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });

  it("parses movie details correctly", async () => {
    const result = await parse(html);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("https://medeiafilmes.com/filmes/laguna-2025");
    expect(firstEntry.link).toBe("https://medeiafilmes.com/filmes/laguna-2025");
    expect(firstEntry.title).toBe("Laguna, Sharunas Bartas");
    expect(firstEntry.imageURL).toBe("https://medeiafilmes.com/uploads/library/laguna_poster.jpg");
    expect(firstEntry.datetime).toEqual(new Date("2025-12-29 13:00"));
    expect(firstEntry.text).toContain("Letterboxd");

    const secondEntry = result.entries[1];
    expect(secondEntry.title).toBe("Onde Aterrar, Hal Hartley");
    expect(secondEntry.datetime).toEqual(new Date("2025-12-29 15:00"));

    const thirdEntry = result.entries[2];
    expect(thirdEntry.title).toBe("A Sombra do Caçador, Charles Laughton");
    expect(thirdEntry.datetime).toEqual(new Date("2025-12-29 17:00"));
    expect(thirdEntry.text).toContain('Ciclo "Jovens e Inocentes"');

    // Fourth entry is on a different date
    const fourthEntry = result.entries[3];
    expect(fourthEntry.title).toBe("A Cidade dos Malditos, John Carpenter");
    expect(fourthEntry.datetime).toEqual(new Date("2025-12-30 21:30"));
  });
});
