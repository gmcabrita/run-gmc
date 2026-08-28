import { describe, expect, it } from "vitest";
import { parseApiResponse, scrapeMediaApi } from "./publicoMedia";

const API_URL = "https://www.publico.pt/api/list/media?page=1&size=20";

const apiResponse = [
  {
    data: "2026-06-22T18:00:53+01:00",
    descricao:
      "A decisão ainda pode ser impugnada judicialmente, mas após o carácter definitivo ou trânsito em julgado da decisão o Chega terá dez dias para pagar a coima.\r\n",
    escondeImagem: false,
    id: 2_179_050,
    itemId: "NOTICIA_2179050",
    multimediaPrincipal: "https://imagens.publico.pt/imagens.aspx/2097343?tp=UH&db=&type=",
    rubrica: "ERC",
    tags: [
      { isPrincipal: true, nome: "Política" },
      { isPrincipal: false, nome: "Media" },
    ],
    titulo: "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
    tituloNoticia:
      "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
    url: "https://www.publico.pt/2026/06/22/politica/noticia/chega-vai-pagar-30-mil-euros-falsa-sondagem-legislativas-2025-2179050",
  },
  {
    data: "2026-06-18T10:15:00+01:00",
    descricao: "   ",
    escondeImagem: true,
    id: 2_178_601,
    multimediaPrincipal: "https://imagens.publico.pt/imagens.aspx/2097000?tp=UH&db=&type=",
    rubrica: "Media",
    titulo: "Story &quot;sem descrição&quot;",
    tituloNoticia: null,
    url: "/2026/06/18/media/noticia/story-sem-descricao-2178601",
  },
];

type PublicoApiFixturePayload = typeof apiResponse;

function createJsonResponse(json: PublicoApiFixturePayload) {
  return new Response(JSON.stringify(json), {
    headers: { "Content-Type": "application/json" },
  });
}

function readFetchUrl(input: RequestInfo | URL): string {
  return new Request(input).url;
}

describe("publicoMedia scraper", () => {
  it("parses API entries", () => {
    const result = parseApiResponse(apiResponse);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-06-22T18:00:53+01:00"),
      id: "https://www.publico.pt/2026/06/22/politica/noticia/chega-vai-pagar-30-mil-euros-falsa-sondagem-legislativas-2025-2179050",
      imageURL: "https://imagens.publico.pt/imagens.aspx/2097343?tp=UH&db=&type=",
      link: "https://www.publico.pt/2026/06/22/politica/noticia/chega-vai-pagar-30-mil-euros-falsa-sondagem-legislativas-2025-2179050",
      text: "A decisão ainda pode ser impugnada judicialmente, mas após o carácter definitivo ou trânsito em julgado da decisão o Chega terá dez dias para pagar a coima.",
      title: "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
    });
    expect(result.entries[1]).toEqual({
      datetime: new Date("2026-06-18T10:15:00+01:00"),
      id: "https://www.publico.pt/2026/06/18/media/noticia/story-sem-descricao-2178601",
      imageURL: undefined,
      link: "https://www.publico.pt/2026/06/18/media/noticia/story-sem-descricao-2178601",
      text: "Media",
      title: 'Story "sem descrição"',
    });
  });

  it("uses fallback fields when preferred strings are empty", () => {
    const result = parseApiResponse([
      {
        data: "",
        dataActualizacao: "2026-06-18T10:15:00+01:00",
        fullUrl: "",
        titulo: "Fallback title",
        tituloNoticia: "",
        url: "/2026/06/18/media/noticia/fallback",
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      datetime: new Date("2026-06-18T10:15:00+01:00"),
      link: "https://www.publico.pt/2026/06/18/media/noticia/fallback",
      title: "Fallback title",
    });
  });

  it("recursively unwraps containers and ignores malformed optional fields", () => {
    const result = parseApiResponse({
      items: {
        results: {
          data: [
            {
              data: false,
              dataActualizacao: "2026-06-18T10:15:00+01:00",
              descricao: 42,
              escondeImagem: "invalid",
              fullUrl: "&nbsp;",
              lead: "Nested lead",
              multimediaPrincipal: { invalid: true },
              tags: "invalid",
              titulo: "Nested title",
              tituloNoticia: "<br>",
              url: "/2026/06/18/media/noticia/nested",
            },
          ],
        },
      },
    });

    expect(result.entries).toEqual([
      {
        datetime: new Date("2026-06-18T10:15:00+01:00"),
        id: "https://www.publico.pt/2026/06/18/media/noticia/nested",
        imageURL: undefined,
        link: "https://www.publico.pt/2026/06/18/media/noticia/nested",
        text: "Nested lead",
        title: "Nested title",
      },
    ]);
  });

  it("fetches the Público media API", async () => {
    const fetchCalls: Array<string> = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = readFetchUrl(input);
      fetchCalls.push(url);

      if (url === API_URL) {
        return createJsonResponse(apiResponse);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await scrapeMediaApi(fetchFn);

    expect(fetchCalls).toEqual([API_URL]);
    expect(result.id).toBe("https://www.publico.pt/media");
    expect(result.link).toBe("https://www.publico.pt/media");
    expect(result.title).toBe("Público - Media");
    expect(result.description).toBe("Público Media");
    expect(result.language).toBe("pt");
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
      'Story "sem descrição"',
    ]);
  });
});
