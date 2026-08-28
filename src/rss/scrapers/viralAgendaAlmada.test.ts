import { describe, expect, it } from "vitest";
import { USERAGENT } from "@rss/common";
import { parse, scrape } from "./viralAgendaAlmada";

function encodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createCard(id: number): string {
  const calendarData = JSON.stringify({
    endDate: "2026-09-15",
    endTime: "23:00",
    location: "Auditório Fernando Lopes Graça (Almada)",
    name: `Evento ${id} & Convidados`,
    startDate: "2026-09-15",
    startTime: "21:00",
  });

  return `
    <li id="c${id}" data-id="${id}" data-url="/pt/events/${id}/evento-${id}" data-date-start="2026-09-15T21:00:00+01:00" class="viral-item viral-event">
      <div class="viral-event-image" data-img="https://cdn.viralagenda.com/images/events/${id}.jpg"></div>
      <div class="atcb" data-atcb="${encodeHtmlAttribute(calendarData)}"></div>
    </li>
  `;
}

function createPage(startId: number, count: number): string {
  return Array.from({ length: count }, (_, index) => createCard(startId + index)).join("\n");
}

const ongoingMarker =
  '<li class="viral-event-past viral-event-ongoing"><span>A decorrer</span></li>';

function createHtmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function createAjaxResponse(html: string, pageTotal: number): Response {
  return Response.json({ html, pageTotal });
}

describe("viralAgendaAlmada scraper", () => {
  it("decodes and parses calendar data from event cards", () => {
    const result = parse(createCard(1_834_686));

    expect(result).toMatchObject({
      id: "https://www.viralagenda.com/pt/setubal/almada",
      language: "pt",
      link: "https://www.viralagenda.com/pt/setubal/almada",
      title: "Agenda Cultural de Almada | Viral Agenda",
    });
    expect(result.entries).toEqual([
      {
        datetime: new Date("2026-09-15T20:00:00.000Z"),
        id: "https://www.viralagenda.com/pt/events/1834686/evento-1834686",
        imageURL: "https://cdn.viralagenda.com/images/events/1834686.jpg",
        link: "https://www.viralagenda.com/pt/events/1834686/evento-1834686",
        text: "2026-09-15 | 21:00–23:00 | Auditório Fernando Lopes Graça (Almada)",
        title: "Evento 1834686 & Convidados",
      },
    ]);
  });

  it("keeps events with malformed optional calendar fields", () => {
    const html = createCard(42).replace(
      "&quot;startTime&quot;:&quot;21:00&quot;",
      "&quot;startTime&quot;:42",
    );
    const result = parse(html);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.text).toBe("2026-09-15 | Auditório Fernando Lopes Graça (Almada)");
  });

  it("follows pagination into ongoing events until Viral Agenda returns a partial page", async () => {
    const requests: Array<{ headers: Headers; url: string }> = [];
    const responses = [
      createHtmlResponse(createPage(1, 30)),
      createAjaxResponse(`${ongoingMarker}${createPage(31, 30)}`, 30),
      createAjaxResponse(createPage(61, 2), 2),
    ];

    const fetchFn: typeof fetch = async (input, init) => {
      requests.push({
        headers: new Headers(init?.headers),
        url: String(input),
      });

      const response = responses.shift();
      if (!response) {
        throw new Error("Unexpected request");
      }
      return response;
    };

    const result = await scrape(fetchFn);

    expect(result.entries).toHaveLength(62);
    expect(requests.map((request) => request.url)).toEqual([
      "https://www.viralagenda.com/pt/setubal/almada?perpage=30",
      "https://www.viralagenda.com/pt/setubal/almada?ajax=1&pa%67e=30&past=0&ongoing=0&perpage=30",
      "https://www.viralagenda.com/pt/setubal/almada?ajax=1&pa%67e=60&past=1&ongoing=1&perpage=30",
    ]);
    expect(requests[0]?.headers.get("user-agent")).toBe(USERAGENT);
    expect(requests[0]?.headers.get("X-Requested-With")).toBeNull();
    expect(requests[1]?.headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("limits scraping to 30 pages", async () => {
    let requestCount = 0;

    const fetchFn: typeof fetch = async () => {
      const pageIndex = requestCount;
      requestCount += 1;
      const html = createPage(pageIndex * 30 + 1, 30);

      return pageIndex === 0 ? createHtmlResponse(html) : createAjaxResponse(html, 30);
    };

    const result = await scrape(fetchFn);

    expect(requestCount).toBe(30);
    expect(result.entries).toHaveLength(900);
  });
});
