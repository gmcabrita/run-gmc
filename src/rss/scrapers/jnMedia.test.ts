import { describe, expect, it } from "vitest";
import { parsePage, readFlightJsonRows, scrapeFirstPages } from "./jnMedia";

const FIRST_PAGE_URL = "https://www.jn.pt/media";
const SECOND_PAGE_URL = "https://www.jn.pt/media?page=2";

interface ArticleFixture {
  Abstract: string;
  Date: string;
  Id: number;
  Media: Array<{ MediaType: string; Url: string }>;
  PreTitle: string;
  Title: string;
  Url: string;
}

function article(slug: string, overrides: Partial<ArticleFixture> = {}): ArticleFixture {
  return {
    Abstract: "",
    Date: "2026-10-16T12:38:00+01:00",
    Id: 1,
    Media: [],
    PreTitle: "",
    Title: `Title ${slug}`,
    Url: `https://www.jn.pt/media/artigo/${slug}/1`,
    ...overrides,
  };
}

function textRow(id: string, text: string): string {
  const byteLength = new TextEncoder().encode(text).length;
  return `${id}:T${byteLength.toString(16)},${text}`;
}

function pushScript(chunk: string): string {
  const escapedPush = JSON.stringify([1, chunk]).replaceAll("<", String.raw`\u003c`);
  return `<script>self.__next_f.push(${escapedPush})</script>`;
}

// Builds a page the way Next.js streams it: the RSC payload is split into
// `self.__next_f.push([1, "..."])` scripts, with "<" escaped in the strings.
function createPageHtml(children: Array<object>): string {
  const navigation = {
    navigation: [{ Items: [{ Name: "Televisão", Url: "/media/televisao" }], Name: "Média" }],
  };
  const treeRow = JSON.stringify(["$", "main", null, { children: [navigation, ...children] }]);
  const payload = [
    '1:"$Sreact.fragment"\n',
    'a:I[97367,["$2"],"OutletBoundary"]\n',
    textRow("5", "<style>a:hover { color: red }\nçã</style>"),
    `9:${treeRow}\n`,
  ].join("");
  const middle = Math.floor(payload.length / 2);

  return [
    "<html><body>",
    "<script>(self.__next_f=self.__next_f||[]).push([0])</script>",
    pushScript(payload.slice(0, middle)),
    pushScript(payload.slice(middle)),
    "</body></html>",
  ].join("");
}

function sectionList(page: number, items: Array<ArticleFixture>) {
  return { Items: items, Offset: 0, Page: page, PageContext: {}, PageSize: 10 };
}

function createResponse(html: string) {
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

describe("jnMedia scraper", () => {
  it("reads JSON rows and skips text rows by byte length", () => {
    const payload = `0:{"a":1}\n${textRow("5", "x: ç\n1:{}")}2:["b"]\n3:I[1,[],"x"]\n`;

    expect(readFlightJsonRows(payload)).toEqual(['{"a":1}', '["b"]']);
  });

  it("parses articles from the RSC payload embedded in the page", () => {
    const entries = parsePage(
      createPageHtml([
        sectionList(1, [
          article("story-one", {
            Media: [
              { MediaType: "video", Url: "https://example.com/video.mp4" },
              { MediaType: "image", Url: "https://staticx.noticiasilimitadas.pt/jn/one.webp" },
            ],
            PreTitle: "netAudience",
            Title: "Story  One\u00A0com espaços",
          }),
          article("story-two", { Abstract: "Resumo", Title: 'Story Two "Premium"' }),
          article("no-title", { Title: "" }),
          article("other-section", { Url: "https://www.jn.pt/desporto/artigo/other/1" }),
        ]),
      ]),
    );

    expect(entries).toEqual([
      {
        datetime: new Date("2026-10-16T11:38:00Z"),
        id: "https://www.jn.pt/media/artigo/story-one/1",
        imageURL: "https://staticx.noticiasilimitadas.pt/jn/one.webp",
        link: "https://www.jn.pt/media/artigo/story-one/1",
        text: "netAudience",
        title: "Story One com espaços",
      },
      {
        datetime: new Date("2026-10-16T11:38:00Z"),
        id: "https://www.jn.pt/media/artigo/story-two/1",
        imageURL: undefined,
        link: "https://www.jn.pt/media/artigo/story-two/1",
        text: "Resumo",
        title: 'Story Two "Premium"',
      },
    ]);
  });

  it("finds section articles by shape when the list fields change", () => {
    const entries = parsePage(
      createPageHtml([
        {
          MostViewed: [
            article("viewed", { Url: "https://www.jn.pt/desporto/artigo/viewed/1" }),
            article("viewed-media"),
          ],
        },
        { Articles: [article("one"), article("two")], CurrentPage: 1 },
      ]),
    );

    expect(entries.map((entry) => entry.title)).toEqual(["Title one", "Title two"]);
  });

  it("fails when the page has no article list", () => {
    expect(() => parsePage("<html><body></body></html>")).toThrow("no article list");
  });

  it("fetches the first two pages and removes duplicates", async () => {
    const pages = new Map([
      [FIRST_PAGE_URL, createPageHtml([sectionList(1, [article("one"), article("two")])])],
      [SECOND_PAGE_URL, createPageHtml([sectionList(2, [article("two"), article("three")])])],
    ]);
    const fetchCalls: Array<string> = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = new Request(input).url;
      fetchCalls.push(url);
      const html = pages.get(url);
      if (!html) {
        throw new Error(`Unexpected fetch: ${url}`);
      }

      return createResponse(html);
    };

    const result = await scrapeFirstPages(fetchFn);

    expect(fetchCalls).toEqual([FIRST_PAGE_URL, SECOND_PAGE_URL]);
    expect(result.id).toBe(FIRST_PAGE_URL);
    expect(result.link).toBe(FIRST_PAGE_URL);
    expect(result.title).toBe("JN - Média");
    expect(result.description).toBe("Jornal de Notícias Média");
    expect(result.language).toBe("pt");
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Title one",
      "Title two",
      "Title three",
    ]);
  });
});
