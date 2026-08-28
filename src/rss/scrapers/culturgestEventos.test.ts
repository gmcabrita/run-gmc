import { describe, expect, it } from "vitest";
import { USERAGENT } from "@rss/common";
import { parse, scrape } from "./culturgestEventos";

const html = `
  <article class="events-item js-masonryItem ">
    <a href="/pt/programacao/falta-de-cha-humor-tabus-censura/?">
      <div class="event-stamp"><img src="/media/stamp.svg" alt=""></div>
      <picture>
        <img src="/media/filer_public/falta-cha.jpg" alt="Falta de Chá: Humor, Tabus e Censura">
      </picture>
      <div class="description">
        <ul class="event-types">
          <li><ul><li data-property="typology" data-id="6" class="type js-Filter">Conferências e Debates</li></ul></li>
        </ul>
        <ul class="event-types mobile">
          <li><ul><li data-property="typology" data-id="6" class="type js-Filter">Conferências e Debates</li></ul></li>
        </ul>
        <div class="event-date">25 Mar 2026</div>
        <h3 class="event-title">Falta de Chá: Humor, Tabus e Censura <span class="subtitle">Mélanie Toulhoat, Rui Lopes, Rita Luís</span></h3>
      </div>
    </a>
  </article>
  <article class="events-item js-masonryItem ">
    <a href="/pt/programacao/diana-niepce-hornfuckers/?">
      <picture>
        <img src="https://www.culturgest.pt/media/filer_public/diana.jpg" alt="Diana Niepce">
      </picture>
      <div class="description">
        <ul class="event-types">
          <li><ul>
            <li data-property="typology" data-id="2" class="type js-Filter">Dança</li>
            <li data-property="typology" data-id="3" class="type js-Filter">Performance</li>
          </ul></li>
        </ul>
        <ul class="event-types mobile">
          <li><ul>
            <li data-property="typology" data-id="2" class="type js-Filter">Dança</li>
            <li data-property="typology" data-id="3" class="type js-Filter">Performance</li>
          </ul></li>
        </ul>
        <div class="event-date">26–28 Mar 2026</div>
        <h3 class="event-title">Diana Niepce <span class="subtitle">Hornfuckers</span></h3>
        <ul class="event-tags">
          <li data-property="tag" data-id="79" class="js-Filter">Temporada 2026</li>
        </ul>
      </div>
    </a>
  </article>
  <article class="events-item js-masonryItem ">
    <a href="/pt/programacao/mater-partir-da-colecao-da-cgd/?">
      <picture>
        <img src="/media/filer_public/mater.jpg" alt="MATER">
      </picture>
      <div class="description">
        <ul class="event-types">
          <li><ul><li data-property="typology" data-id="4" class="type js-Filter">Artes Visuais</li></ul></li>
          <li class="secondary"><ul><li data-property="place" data-id="3" class="secondary type js-Filter">Fora de Portas</li></ul></li>
        </ul>
        <ul class="event-types mobile">
          <li><ul><li data-property="typology" data-id="4" class="type js-Filter">Artes Visuais</li></ul></li>
          <li class="secondary"><ul><li data-property="place" data-id="3" class="secondary type js-Filter">Fora de Portas</li></ul></li>
        </ul>
        <div class="event-date">11 Abr<br />– 21 Jun 2026</div>
        <h3 class="event-title">MATER <span class="subtitle">A partir da Coleção da CGD</span></h3>
        <ul class="event-tags">
          <li data-property="tag" data-id="72" class="js-Filter">Desconcentrar</li>
        </ul>
      </div>
    </a>
  </article>
  <article class="events-item js-masonryItem ">
    <div class="description">
      <h3 class="event-title">Sem link</h3>
    </div>
  </article>
`;

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("culturgestEventos scraper", () => {
  it("parses event cards from the ajax HTML", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://www.culturgest.pt/pt/programacao/por-evento/");
    expect(result.link).toBe("https://www.culturgest.pt/pt/programacao/por-evento/");
    expect(result.title).toBe("Agenda | Culturgest");
    expect(result.description).toBe("Agenda de eventos da Culturgest");
    expect(result.language).toBe("pt");
    expect(result.entries).toHaveLength(3);
  });

  it("extracts titles, dates, tags and images", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-03-25T00:00:00.000Z"),
      id: "https://www.culturgest.pt/pt/programacao/falta-de-cha-humor-tabus-censura/",
      imageURL: "https://www.culturgest.pt/media/filer_public/falta-cha.jpg",
      link: "https://www.culturgest.pt/pt/programacao/falta-de-cha-humor-tabus-censura/",
      text: "25 Mar 2026 | Conferências e Debates",
      title: "Falta de Chá: Humor, Tabus e Censura - Mélanie Toulhoat, Rui Lopes, Rita Luís",
    });

    expect(result.entries[1]).toEqual({
      datetime: new Date("2026-03-26T00:00:00.000Z"),
      id: "https://www.culturgest.pt/pt/programacao/diana-niepce-hornfuckers/",
      imageURL: "https://www.culturgest.pt/media/filer_public/diana.jpg",
      link: "https://www.culturgest.pt/pt/programacao/diana-niepce-hornfuckers/",
      text: "26 – 28 Mar 2026 | Dança | Performance | Temporada 2026",
      title: "Diana Niepce - Hornfuckers",
    });

    expect(result.entries[2]).toEqual({
      datetime: new Date("2026-04-11T00:00:00.000Z"),
      id: "https://www.culturgest.pt/pt/programacao/mater-partir-da-colecao-da-cgd/",
      imageURL: "https://www.culturgest.pt/media/filer_public/mater.jpg",
      link: "https://www.culturgest.pt/pt/programacao/mater-partir-da-colecao-da-cgd/",
      text: "11 Abr – 21 Jun 2026 | Artes Visuais | Fora de Portas | Desconcentrar",
      title: "MATER - A partir da Coleção da CGD",
    });
  });

  it("sends the mandatory ajax header", async () => {
    let requestInput: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;

    const fetchFn: typeof fetch = async (input, init) => {
      requestInput = input;
      requestInit = init;
      return createResponse();
    };

    await scrape(fetchFn);

    expect(String(requestInput)).toBe("https://www.culturgest.pt/pt/programacao/schedule/events/");

    const headers = new Headers(requestInit?.headers);
    expect(headers.get("X-Requested-With")).toBe("XMLHttpRequest");
    expect(headers.get("user-agent")).toBe(USERAGENT);
  });
});
