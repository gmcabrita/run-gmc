import { describe, expect, it } from "vitest";
import { parseApiResponse, scrapeMediaApi } from "./publicoMedia";

const API_URL = "https://www.publico.pt/api/list/media?page=1&size=20";

const apiResponse = [
  {
    id: 2179050,
    titulo: "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
    tituloNoticia: "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
    descricao:
      "A decisão ainda pode ser impugnada judicialmente, mas após o carácter definitivo ou trânsito em julgado da decisão o Chega terá dez dias para pagar a coima.\r\n",
    url: "https://www.publico.pt/2026/06/22/politica/noticia/chega-vai-pagar-30-mil-euros-falsa-sondagem-legislativas-2025-2179050",
    multimediaPrincipal: "https://imagens.publico.pt/imagens.aspx/2097343?tp=UH&db=&type=",
    rubrica: "ERC",
    data: "2026-06-22T18:00:53+01:00",
    itemId: "NOTICIA_2179050",
    escondeImagem: false,
    tags: [
      { nome: "Política", isPrincipal: true },
      { nome: "Media", isPrincipal: false },
    ],
  },
  {
    id: 2178601,
    titulo: "Story &quot;sem descrição&quot;",
    tituloNoticia: null,
    descricao: "   ",
    url: "/2026/06/18/media/noticia/story-sem-descricao-2178601",
    multimediaPrincipal: "https://imagens.publico.pt/imagens.aspx/2097000?tp=UH&db=&type=",
    rubrica: "Media",
    data: "2026-06-18T10:15:00+01:00",
    escondeImagem: true,
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
      id: "https://www.publico.pt/2026/06/22/politica/noticia/chega-vai-pagar-30-mil-euros-falsa-sondagem-legislativas-2025-2179050",
      link: "https://www.publico.pt/2026/06/22/politica/noticia/chega-vai-pagar-30-mil-euros-falsa-sondagem-legislativas-2025-2179050",
      title: "Chega vai ter de pagar 30 mil euros por falsa sondagem nas legislativas de 2025",
      text: "A decisão ainda pode ser impugnada judicialmente, mas após o carácter definitivo ou trânsito em julgado da decisão o Chega terá dez dias para pagar a coima.",
      datetime: new Date("2026-06-22T18:00:53+01:00"),
      imageURL: "https://imagens.publico.pt/imagens.aspx/2097343?tp=UH&db=&type=",
    });
    expect(result.entries[1]).toEqual({
      id: "https://www.publico.pt/2026/06/18/media/noticia/story-sem-descricao-2178601",
      link: "https://www.publico.pt/2026/06/18/media/noticia/story-sem-descricao-2178601",
      title: 'Story "sem descrição"',
      text: "Media",
      datetime: new Date("2026-06-18T10:15:00+01:00"),
      imageURL: undefined,
    });
  });

  it("uses fallback fields when preferred strings are empty", () => {
    const result = parseApiResponse([
      {
        fullUrl: "",
        url: "/2026/06/18/media/noticia/fallback",
        tituloNoticia: "",
        titulo: "Fallback title",
        data: "",
        dataActualizacao: "2026-06-18T10:15:00+01:00",
      },
    ]);

    expect(result.entries[0]).toMatchObject({
      link: "https://www.publico.pt/2026/06/18/media/noticia/fallback",
      title: "Fallback title",
      datetime: new Date("2026-06-18T10:15:00+01:00"),
    });
  });

  it("recursively unwraps containers and ignores malformed optional fields", () => {
    const result = parseApiResponse({
      items: {
        results: {
          data: [
            {
              fullUrl: "&nbsp;",
              url: "/2026/06/18/media/noticia/nested",
              tituloNoticia: "<br>",
              titulo: "Nested title",
              descricao: 42,
              lead: "Nested lead",
              data: false,
              dataActualizacao: "2026-06-18T10:15:00+01:00",
              multimediaPrincipal: { invalid: true },
              escondeImagem: "invalid",
              tags: "invalid",
            },
          ],
        },
      },
    });

    expect(result.entries).toEqual([
      {
        id: "https://www.publico.pt/2026/06/18/media/noticia/nested",
        link: "https://www.publico.pt/2026/06/18/media/noticia/nested",
        title: "Nested title",
        text: "Nested lead",
        datetime: new Date("2026-06-18T10:15:00+01:00"),
        imageURL: undefined,
      },
    ]);
  });

  it("fetches the Público media API", async () => {
    const fetchCalls: string[] = [];
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
