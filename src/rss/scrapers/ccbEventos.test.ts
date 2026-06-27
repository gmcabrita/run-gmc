import { describe, expect, it } from "vitest";
import { parse } from "./ccbEventos";

const html = `
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-240661" class="cards cards_">
      <a href="/evento/a-valentina-e-a-valeria-nao-estao-mortas/2026-03-19/" aria-label="A Valentina e a Valeria não estão mortas" class="card_click"></a>
      <div class="card_imgs cards_outro">
        <div class="card_img card_img_outro" style="background-image: url('/wp-content/uploads/valentina.jpg');"></div>
        <div class="card_tag">
          <p class="tag">Teatro</p>
          <p class="tag">...</p>
        </div>
      </div>
      <div class="card_body">
        <span class="card_date">19 a 22, 26 a 29 março </span>
        <p class="card_title">A Valentina e a Valeria não estão mortas</p>
        <p class="card_desc">Flávia Gusmão e Jacinto Lucas Pires</p>
        <span><span class="card_info">Black Box</span></span>
      </div>
    </div>
  </div>
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-238754" class="cards cards_">
      <a href="https://www.ccb.pt/evento/instalacao-james-webb/" aria-label="James Webb There’s No Place Called Home (Belém, Lisbon)" class="card_click"></a>
      <div class="card_imgs cards_outro">
        <div class="card_img card_img_outro" style="background-image: url('https://www.ccb.pt/wp-content/uploads/james-webb.jpg');"></div>
      </div>
      <div class="card_body">
        <span class="card_date">Desde 18 julho</span>
        <p class="card_title">James Webb <br>There’s No Place Called Home (Belém, Lisbon)</p>
        <span><span class="card_info">MAC/CCB</span></span>
      </div>
    </div>
  </div>
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-268926" class="cards cards_">
      <a href="/evento/dia-mundial-da-poesia-2026/" aria-label="Dia Mundial da Poesia" class="card_click"></a>
      <div class="card_body">
        <span class="card_date">21 março das 10:30 às 19:00</span>
        <p class="card_desc">Programação de Nuno Artur Silva</p>
      </div>
    </div>
  </div>
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-invalid" class="cards cards_">
      <div class="card_body">
        <p class="card_title">Sem link</p>
      </div>
    </div>
  </div>
`;

const htmlWithIgnoredCards = `
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-268000" class="cards cards_">
      <a href="/evento/atividades-para-familias-museu-mac-ccb/2026-06-21/" aria-label="Atividades para Famílias" class="card_click"></a>
      <div class="card_imgs cards_outro">
        <div class="card_tag">
          <p class="tag">Atividades</p>
        </div>
      </div>
      <div class="card_body">
        <span class="card_date">Sábados e domingos</span>
        <p class="card_title">Atividades para Famílias</p>
        <span><span class="card_info">MAC/CCB</span></span>
      </div>
    </div>
  </div>
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-268001" class="cards cards_">
      <a href="/evento/visitas-guiadas-2/2026-06-28/" aria-label="Visitas Guiadas" class="card_click"></a>
      <div class="card_imgs cards_outro">
        <div class="card_tag">
          <p class="tag">Atividades</p>
        </div>
      </div>
      <div class="card_body">
        <span class="card_date">Até dezembro 2026</span>
        <p class="card_title">Visitas Guiadas</p>
      </div>
    </div>
  </div>
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-268002" class="cards cards_">
      <a href="/evento/exposicao-jose-pedro-croft/2026-06-28/" aria-label="José Pedro Croft" class="card_click"></a>
      <div class="card_imgs cards_outro">
        <div class="card_tag">
          <p class="tag">Exposições</p>
        </div>
      </div>
      <div class="card_body">
        <span class="card_date">Exposição temporária até 13 setembro de 2026</span>
        <p class="card_title">José Pedro Croft</p>
        <p class="card_desc">Reflexos, Enclaves, Desvios</p>
        <span><span class="card_info">MAC/CCB</span></span>
      </div>
    </div>
  </div>
  <div class="col-md-4 col-sm-6 col-xs-12">
    <div id="post-268003" class="cards cards_">
      <a href="/evento/visitas-guiadas-a-exposicao-2-museu-mac-ccb/2026-06-28/" aria-label="Visitas às Exposições" class="card_click"></a>
      <div class="card_imgs cards_outro">
        <div class="card_tag">
          <p class="tag">Atividades</p>
        </div>
      </div>
      <div class="card_body">
        <span class="card_date">Até julho de 2026</span>
        <p class="card_title">Visitas às Exposições</p>
        <span><span class="card_info">MAC/CCB</span></span>
      </div>
    </div>
  </div>
`;

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function createIgnoredCardsResponse() {
  return new Response(`${html}${htmlWithIgnoredCards}`, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("ccbEventos scraper", () => {
  it("parses event cards from the ajax HTML", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://www.ccb.pt/eventos/");
    expect(result.link).toBe("https://www.ccb.pt/eventos/");
    expect(result.title).toBe("Eventos | CCB");
    expect(result.description).toBe("Agenda de eventos do CCB");
    expect(result.language).toBe("pt");
    expect(result.entries).toHaveLength(3);
  });

  it("extracts normalized titles, text, images and dates", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      id: "https://www.ccb.pt/evento/a-valentina-e-a-valeria-nao-estao-mortas/2026-03-19/",
      link: "https://www.ccb.pt/evento/a-valentina-e-a-valeria-nao-estao-mortas/2026-03-19/",
      title: "A Valentina e a Valeria não estão mortas",
      text: "19 a 22, 26 a 29 março | Flávia Gusmão e Jacinto Lucas Pires | Black Box | Teatro",
      imageURL: "https://www.ccb.pt/wp-content/uploads/valentina.jpg",
      datetime: new Date("2026-03-19T00:00:00.000Z"),
    });

    expect(result.entries[1]).toEqual({
      id: "https://www.ccb.pt/evento/instalacao-james-webb/",
      link: "https://www.ccb.pt/evento/instalacao-james-webb/",
      title: "James Webb There’s No Place Called Home (Belém, Lisbon)",
      text: "Desde 18 julho | MAC/CCB",
      imageURL: "https://www.ccb.pt/wp-content/uploads/james-webb.jpg",
      datetime: undefined,
    });

    expect(result.entries[2]).toEqual({
      id: "https://www.ccb.pt/evento/dia-mundial-da-poesia-2026/",
      link: "https://www.ccb.pt/evento/dia-mundial-da-poesia-2026/",
      title: "Dia Mundial da Poesia",
      text: "21 março das 10:30 às 19:00 | Programação de Nuno Artur Silva",
      imageURL: undefined,
      datetime: undefined,
    });
  });

  it("ignores recurring activities and exhibitions by tag", async () => {
    const result = await parse(createIgnoredCardsResponse());

    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "A Valentina e a Valeria não estão mortas",
      "James Webb There’s No Place Called Home (Belém, Lisbon)",
      "Dia Mundial da Poesia",
    ]);
  });
});
