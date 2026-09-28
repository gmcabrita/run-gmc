import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCinecartazQuestionEndpoints,
  buildCinecartazQuestionEmail,
  parseCinecartazQuestionPage,
  sendCinecartazQuestionsByEmail,
} from "./index";
import pendingHtml from "./__fixtures__/veredito-social-pending.html";

const PLACEHOLDER =
  "Os convites ser&#227;o atribu&#237;dos aos primeiros leitores que respondam correctamente &#224; quest&#227;o que aqui ser&#225; colocada hoje, dia 24 de Setembro de 2026, a partir das 11h30.";

const PASSATEMPOS_URL = "https://cinecartaz.publico.pt/passatempos";
const FIRST_PASSATEMPO_URL = "https://cinecartaz.publico.pt/passatempos/primeiro-1";
const SECOND_PASSATEMPO_URL = "https://cinecartaz.publico.pt/passatempos/segundo-2";
const LISTING_HTML = [FIRST_PASSATEMPO_URL, SECOND_PASSATEMPO_URL]
  .map(
    (url) => `<div class="hobbie-card">
  <h3 class="hobbie-card__title">${url}</h3>
  <a class="button--hobbie" href="${new URL(url).pathname}">Participar</a>
</div>`,
  )
  .join("\n");

function htmlResponse(html: string, status = 200) {
  return new Response(html, { headers: { "Content-Type": "text/html" }, status });
}

// Serves the listing and every passatempo page. `failures` maps a URL to an HTTP error status.
function mockCinecartazPages(failures: Record<string, number>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const failureStatus = failures[url];
    if (failureStatus !== undefined) {
      return htmlResponse("", failureStatus);
    }
    return htmlResponse(url === PASSATEMPOS_URL ? LISTING_HTML : pendingHtml);
  });
}

describe("cinecartaz passatempo question", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks every passatempo on the listing page", async () => {
    mockCinecartazPages({});
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    addCinecartazQuestionEndpoints(app);

    const response = await app.request("/cinecartaz.sendPassatempoQuestionsByEmail");

    expect(await response.json()).toEqual([
      expect.objectContaining({ posted: false, url: FIRST_PASSATEMPO_URL }),
      expect.objectContaining({ posted: false, url: SECOND_PASSATEMPO_URL }),
    ]);
  });

  it("checks the other passatempos when one page fails", async () => {
    const fetchSpy = mockCinecartazPages({ [FIRST_PASSATEMPO_URL]: 500 });

    await expect(sendCinecartazQuestionsByEmail(env)).rejects.toThrow(AggregateError);
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toContain(SECOND_PASSATEMPO_URL);
  });

  it("fails when the listing page fails", async () => {
    mockCinecartazPages({ [PASSATEMPOS_URL]: 503 });

    await expect(sendCinecartazQuestionsByEmail(env)).rejects.toThrow("returned 503");
  });

  it("serves the endpoint response as utf-8 JSON", async () => {
    mockCinecartazPages({});
    const app = new Hono<{ Bindings: CloudflareBindings }>();
    addCinecartazQuestionEndpoints(app);

    const response = await app.request("/cinecartaz.sendPassatempoQuestionsByEmail");

    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    const body = new TextDecoder("utf-8").decode(await response.arrayBuffer());
    expect(body).toContain('"posted":false');
    expect(body).toContain("será colocada");
  });

  it("reports the question as not posted while the placeholder is shown", async () => {
    const status = await parseCinecartazQuestionPage(htmlResponse(pendingHtml));

    expect(status.posted).toBe(false);
    expect(status.title).toBe("O Veredito Social | Nos cinemas a 8 de Outubro");
    expect(status.description).toContain("que aqui será colocada hoje");
    expect(status.description).toContain(
      "Dia 7 de Outubro de 2026, às 21h30, nos Cinemas NOS Colombo - 10 convites duplos",
    );
    expect(status.description).not.toContain("Notas");
  });

  it("detects a posted question", async () => {
    const html = pendingHtml.replace(
      PLACEHOLDER,
      "Os convites ser&#227;o atribu&#237;dos aos primeiros leitores que respondam correctamente &#224; seguinte quest&#227;o:<br><strong>Qual o nome do realizador de A Rede Social?</strong>",
    );
    const status = await parseCinecartazQuestionPage(htmlResponse(html));

    expect(status.posted).toBe(true);
    expect(status.description).toContain("Qual o nome do realizador de A Rede Social?");
  });

  it("detects a posted question without a question mark once the placeholder is gone", async () => {
    const html = pendingHtml.replace(
      PLACEHOLDER,
      "Diga-nos o nome do realizador de A Rede Social.",
    );
    const status = await parseCinecartazQuestionPage(htmlResponse(html));

    expect(status.posted).toBe(true);
  });

  it("does not report a page without the description box as posted", async () => {
    const status = await parseCinecartazQuestionPage(
      htmlResponse("<html><body><p>Página não encontrada</p></body></html>"),
    );

    expect(status.posted).toBe(false);
    expect(status.description).toBe("");
  });

  it("builds an email with the description", () => {
    const email = buildCinecartazQuestionEmail("https://example.com/p", {
      description: "Linha 1\nQual é <a> pergunta?",
      posted: true,
      title: "O Veredito Social",
    });

    expect(email.subject).toBe("[Passatempo Cinecartaz] Pergunta publicada: O Veredito Social");
    expect(email.body).toContain('<a href="https://example.com/p">O Veredito Social</a>');
    expect(email.body).toContain("<p>Qual é &lt;a&gt; pergunta?</p>");
  });
});
