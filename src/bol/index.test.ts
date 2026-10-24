import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBolEmail,
  decodeBolHtmlEntities,
  filterBolEvents,
  getBolIdempotencyKey,
  groupBolWatchesByPage,
  normalizeBolHostname,
  parseBolEvents,
  sendBolEventsByEmail,
} from "./index";
import { BOL_WATCHES } from "./watches";
import html from "./__fixtures__/cinemasaojorge.html";

const page = "https://cinemasaojorge.bol.pt/";

describe("bol parsing", () => {
  it("parses Event ld+json blocks", () => {
    const events = parseBolEvents(html);
    expect(events).toHaveLength(27);
    expect(events[0]).toEqual({
      available: true,
      date: "2026-10-24",
      id: "1_186252",
      name: "Doclisboa2026 - Competição Internacional | Noli me tangere",
      time: "14:00",
      url: "https://www.bol.pt/Comprar/Bilhetes/186252-doclisboa2026_competicao_internacional_noli_me_tangere-cinema_sao_jorge/",
    });
  });

  it("skips non Event entries and marks sold out events", () => {
    const fixture = `
      <script type="application/ld+json">{"@type":"Product","name":"Cartão","url":"x","offers":{}}</script>
      <script type="application/ld+json">{"@type":"Event","productID":"1_1","name":"A","url":"u","startDate":"2026-11-01T21:00:00.0000000","offers":{"availability":"https://schema.org/SoldOut"}}</script>
    `;
    expect(parseBolEvents(fixture)).toEqual([
      { available: false, date: "2026-11-01", id: "1_1", name: "A", time: "21:00", url: "u" },
    ]);
  });

  it("decodes HTML entities in names", () => {
    expect(decodeBolHtmlEntities("&#34;TERAPIA&#34; &amp; &#xE0;")).toBe('"TERAPIA" & à');
  });
});

describe("bol filtering", () => {
  const events = parseBolEvents(html);

  it("matches keyword ignoring case and accents", () => {
    const matched = filterBolEvents(events, { keyword: "terra a lua", page });
    expect(matched.map((event) => event.id)).toEqual([
      "1_186253",
      "1_186255",
      "1_186258",
      "1_186260",
    ]);
  });

  it("filters by date", () => {
    const matched = filterBolEvents(events, { date: ["2026-11-19"], keyword: "mono", page });
    expect(matched.map((event) => event.id)).toEqual(["1_177394"]);
  });

  it("drops events that are not available", () => {
    const soldOut = events.map((event) => ({ ...event, available: false }));
    expect(filterBolEvents(soldOut, { keyword: "mono", page })).toEqual([]);
  });
});

describe("bol email", () => {
  const watch = { keyword: "mono", page };
  const [event] = filterBolEvents(parseBolEvents(html), watch);

  it("builds the subject and body for one event", () => {
    const { body, subject } = buildBolEmail(watch, event);
    expect(subject).toBe("[BOL] MONO - ANDRÉ PINHEIRO @ cinemasaojorge.bol.pt: 2026-11-18 22:00");
    expect(body).toContain(event.url);
  });

  it("derives the idempotency key from the hostname and event URL", async () => {
    const key = await getBolIdempotencyKey(watch, event);
    expect(key).toMatch(/^bol-cinemasaojorge\.bol\.pt-[0-9a-f]{64}$/);
    // Keyword and page casing do not change the key.
    expect(
      await getBolIdempotencyKey(
        { keyword: "pinheiro", page: "https://CinemaSaoJorge.bol.pt./" },
        event,
      ),
    ).toBe(key);
    expect(await getBolIdempotencyKey(watch, { ...event, url: `${event.url}x` })).not.toBe(key);
  });

  it("normalizes the hostname", () => {
    expect(normalizeBolHostname("https://CinemaSaoJorge.BOL.pt./agenda")).toBe(
      "cinemasaojorge.bol.pt",
    );
  });
});

describe("bol page requests", () => {
  beforeEach(async () => {
    const { keys } = await env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.list({ prefix: "bol-" });
    await Promise.all(keys.map(({ name }) => env.RUN_GMC_EMAIL_IDEMPOTENCY_KV.delete(name)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups watches by normalized page URL", () => {
    const groups = groupBolWatchesByPage([
      { keyword: "a", page: "https://cinemasaojorge.bol.pt" },
      { keyword: "b", page },
      { keyword: "c", page: "https://ccb.bol.pt/" },
    ]);
    expect([...groups.keys()]).toEqual([page, "https://ccb.bol.pt/"]);
    expect(groups.get(page)?.map((watch) => watch.keyword)).toEqual(["a", "b"]);
  });

  it("requests a shared page once", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(html));
    const watches = [
      { date: ["2099-01-01"], keyword: "mono", page },
      { date: ["2099-01-01"], keyword: "terra a lua", page },
    ];

    const results = await sendBolEventsByEmail(env, watches);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.watch)).toEqual(watches);
  });

  it("emails each event once when several keywords match it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(html));
    const watches = [
      { date: ["2026-11-19"], keyword: "mono", page },
      { date: ["2026-11-19"], keyword: "andre pinheiro", page },
    ];

    const [first, second] = await sendBolEventsByEmail(env, watches);
    expect(first.sent.map((event) => event.id)).toEqual(["1_177394"]);
    expect(second.events.map((event) => event.id)).toEqual(["1_177394"]);
    expect(second.sent).toEqual([]);

    const [again] = await sendBolEventsByEmail(env, watches);
    expect(again.sent).toEqual([]);
  });

  it("reports a page failure for every watch on that page", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("down", { status: 503 }),
    );

    await expect(
      sendBolEventsByEmail(env, [
        { keyword: "mono", page },
        { keyword: "terra a lua", page },
      ]),
    ).rejects.toMatchObject({
      errors: [
        { message: `BOL watch "mono" on ${page} failed` },
        { message: `BOL watch "terra a lua" on ${page} failed` },
      ],
    });
  });
});

describe("bol watches", () => {
  it("point at bol.pt venue pages", () => {
    for (const watch of BOL_WATCHES) {
      expect(new URL(watch.page).hostname).toMatch(/\.bol\.pt$/);
    }
  });
});
