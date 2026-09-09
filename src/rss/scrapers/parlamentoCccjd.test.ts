import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { addScrapedRssEndpoints } from "../scrapers";
import { parseParlamentoCccjd } from "./parlamentoCccjd";
import html from "./__fixtures__/parlamento-cccjd.html";

const PAGE_URL = "https://www.parlamento.pt/sites/COM/XVIILeg/12CCCJD/Paginas/Default.aspx";
const relayEnv = {
  HTTP_RELAY_TOKEN: "relay-token",
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
};

function createParlamentoResponse(content = html): Response {
  return new Response(content, { headers: { "Content-Type": "text/html" } });
}

function createParlamentoRow(href: string, title: string, date = "2026-09-01"): string {
  return `<div class="row margin_h0 margin-Top-15">
    <div><div class="TextoRegular-Titulo">Título</div><a class="TextoRegular" href="${href}">${title}</a></div>
    <div><div class="TextoRegular-Titulo">Data</div><div class="TextoRegular">${date}</div></div>
  </div>`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parlamentoCccjd scraper", () => {
  it("parses the activity sections from the captured homepage", async () => {
    const result = await parseParlamentoCccjd(createParlamentoResponse());

    expect(result).toMatchObject({
      id: PAGE_URL,
      language: "pt",
      link: PAGE_URL,
      title: "Parlamento – Comissão de Cultura, Comunicação, Juventude e Desporto",
    });
    expect(result.entries).toHaveLength(10);
    expect(result.entries.filter((entry) => entry.title.startsWith("Agenda:"))).toHaveLength(1);
    expect(result.entries.filter((entry) => entry.title.startsWith("Audição:"))).toHaveLength(3);
    expect(result.entries.filter((entry) => entry.title.startsWith("Audiência:"))).toHaveLength(3);
    expect(result.entries.filter((entry) => entry.title.startsWith("Iniciativa:"))).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({
      datetime: new Date("2026-09-09T00:00:00Z"),
      id: `${PAGE_URL}#agenda-49`,
      title: "Agenda: 49 - Ordinária",
    });
    expect(result.entries[0].text).toContain("<strong>Hora:</strong> 11:00");
    expect(result.entries[0].text).toContain("<strong>Local:</strong> Sala 9");
    expect(new URL(result.entries[0].link).searchParams.get("Fich")).toBe("CCCJD_8_49.pdf");
    expect(result.entries.map((entry) => entry.datetime?.getTime())).toEqual(
      result.entries.map((entry) => entry.datetime?.getTime()).toSorted((a, b) => b! - a!),
    );
  });

  it("keeps relative detail links, source dates, entities, authors and status", async () => {
    const { entries } = await parseParlamentoCccjd(createParlamentoResponse());
    const hearing = entries.find((entry) => entry.link.endsWith("DetalheAudicao.aspx?BID=180322"));
    expect(hearing).toMatchObject({
      datetime: new Date("2026-07-08T00:00:00Z"),
      id: "https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheAudicao.aspx?BID=180322",
    });
    expect(hearing?.text).toContain(
      "<strong>Entidades:</strong> Presidente da Entidade Reguladora",
    );
    const initiative = entries.find((entry) => entry.link.endsWith("BID=377143"));
    expect(initiative?.datetime).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(initiative?.text).toContain("<strong>Autores:</strong> CH");
    expect(initiative?.text).toContain("<strong>Estado:</strong> Baixa comissão para discussão");
    const audience = entries.find((entry) => entry.link.endsWith("BID=127789"));
    expect(audience?.datetime).toEqual(new Date("2026-07-28T00:00:00Z"));
  });

  it("keeps the agenda ID when the encrypted PDF path changes", async () => {
    const first = await parseParlamentoCccjd(createParlamentoResponse());
    const second = await parseParlamentoCccjd(
      createParlamentoResponse(html.replace(/Path=[^&]+/, "Path=changed")),
    );
    expect(first.entries[0].id).toBe(second.entries[0].id);
    expect(first.entries[0].link).not.toBe(second.entries[0].link);
  });

  it("parses petition rows and normalizes nested text and HTML entities", async () => {
    const row = createParlamentoRow(
      "/ActividadeParlamentar/Paginas/DetalhePeticao.aspx?BID=123",
      "  Cultura <em>&amp; comunicação</em>\n &lt;local&gt; ",
    );
    const result = await parseParlamentoCccjd(
      createParlamentoResponse(`<div id="Peticoes">${row}</div>`),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("Petição: Cultura & comunicação <local>");
    expect(result.entries[0].text).toContain("Cultura &amp; comunicação &lt;local&gt;");
  });

  it("skips navigation, incomplete rows, unsafe links and duplicate entries", async () => {
    const valid = createParlamentoRow("/detail?BID=1", "Valid entry");
    const content = `<nav>${valid}</nav><div id="Iniciativas">
      ${createParlamentoRow("", "Missing link")}
      ${createParlamentoRow("/detail?BID=2", " ")}
      ${createParlamentoRow("javascript:alert(1)", "Unsafe link")}
      ${createParlamentoRow("https://[invalid", "Invalid link")}
      ${valid}${valid}
      <a class="TextoRegular mais" href="/all">[ + ]</a>
    </div>`;
    const result = await parseParlamentoCccjd(createParlamentoResponse(content));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("Iniciativa: Valid entry");
  });

  it.each(["", "not a date", "2026-02-30", "2026-13-01"])(
    "omits an invalid source date: %s",
    async (date) => {
      const content = `<div id="Audicoes">${createParlamentoRow("/detail", "Hearing", date)}</div>`;
      const result = await parseParlamentoCccjd(createParlamentoResponse(content));
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].datetime).toBeUndefined();
    },
  );

  it("returns no entries when the sections are empty", async () => {
    const result = await parseParlamentoCccjd(
      createParlamentoResponse('<div id="Peticoes">Não existem petições.</div>'),
    );
    expect(result.entries).toEqual([]);
  });

  it("serves the registered RSS endpoint through the authenticated HTTP relay", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createParlamentoResponse());
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    addScrapedRssEndpoints(app);
    const response = await app.request("/rss.parlamentoCccjd", undefined, relayEnv);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0];
    const request = new Request(input, init);
    expect(request.url).toBe(`${relayEnv.HTTP_RELAY_URL}/${PAGE_URL}`);
    expect(request.headers.get("authorization")).toBe("Bearer relay-token");
    expect(request.headers.get("accept")).toBe("text/html");
    expect(request.headers.get("user-agent")).toBeTruthy();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    const rss = await response.text();
    expect(rss).toContain("Agenda: 49 - Ordinária");
    expect(rss).toContain("Agendas, audições, audiências, iniciativas e petições");
  });

  it("returns an error when the source request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    addScrapedRssEndpoints(app);
    app.onError((error, ctx) => ctx.text(error.message, 502));
    const response = await app.request("/rss.parlamentoCccjd", undefined, relayEnv);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Parlamento CCCJD request failed: 503");
  });
});
