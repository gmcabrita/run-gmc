import { describe, expect, it } from "vitest";
import {
  buildNosCinemasEmail,
  decodeNosCinemasBody,
  extractNosCinemasAggregateFormatNumbers,
  filterNosCinemasSessions,
  getNosCinemasIdempotencyKey,
  getNosCinemasMoviePageUrl,
  getNosCinemasSearchUrl,
  isRetryableNosCinemasFailure,
  parseNosCinemasSearchResults,
  retryNosCinemasRequest,
} from "./index";
import sessionsJson from "./__fixtures__/dune-sessions.json";
import searchJson from "./__fixtures__/dune-search.json";

describe("nosCinemas search", () => {
  it("builds the search URL with a wildcard suffix", () => {
    expect(getNosCinemasSearchUrl("dune")).toBe(
      "https://www.cinemas.nos.pt/content/cinemas/language-masters/pt/cinemas.searchresults.json/_jcr_content/root/header/search?fulltext=dune*&resultsOffset=0",
    );
    expect(getNosCinemasSearchUrl("dune", 10)).toContain("resultsOffset=10");
  });

  it("maps search result URLs to public movie pages", () => {
    expect(
      getNosCinemasMoviePageUrl(
        "/content/cinemas/language-masters/pt/filmes/dune---duna--parte-tres-.html",
      ),
    ).toBe("https://www.cinemas.nos.pt/filmes/dune---duna--parte-tres-");
  });

  it("parses search results", () => {
    const results = parseNosCinemasSearchResults(searchJson);
    expect(results.length).toBeGreaterThan(0);
    expect(results[1]).toEqual({
      title: "Dune - Duna: Parte Três",
      url: "https://www.cinemas.nos.pt/filmes/dune---duna--parte-tres-",
    });
  });

  it("extracts unique aggregate format numbers from a movie page", () => {
    const html = `
      <div data-aggregateformatnumber="0f091424-58c7-4949-b17a-9d3b06c64069"></div>
      <div data-aggregateformatnumber="0f091424-58c7-4949-b17a-9d3b06c64069"></div>
    `;
    expect(extractNosCinemasAggregateFormatNumbers(html)).toEqual([
      "0f091424-58c7-4949-b17a-9d3b06c64069",
    ]);
  });
});

describe("nosCinemas body decoding", () => {
  it("falls back to ISO-8859-1 when the bytes are not valid utf-8", () => {
    const latin1 = new ArrayBuffer(7);
    new Uint8Array(latin1).set([0x50, 0x61, 0x6c, 0xe1, 0x63, 0x69, 0x6f]);
    expect(decodeNosCinemasBody(latin1)).toBe("Palácio");
  });

  it("keeps valid utf-8", () => {
    const encoded = new TextEncoder().encode("Palácio");
    const utf8 = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(utf8).set(encoded);
    expect(decodeNosCinemasBody(utf8)).toBe("Palácio");
  });
});

describe("nosCinemas session filtering", () => {
  it("keeps all sessions when no filters are set", () => {
    const sessions = filterNosCinemasSessions(sessionsJson, { keyword: "dune" });
    expect(sessions.length).toBeGreaterThan(10);
  });

  it("filters by venue substring ignoring case and accents", () => {
    const sessions = filterNosCinemasSessions(sessionsJson, {
      keyword: "dune",
      venue: ["palacio do gelo"],
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(new Set(sessions.map((session) => session.theater))).toEqual(
      new Set(["Cinemas NOS Palácio do Gelo"]),
    );
  });

  it("filters by date and venue", () => {
    const sessions = filterNosCinemasSessions(sessionsJson, {
      date: ["2026-12-15"],
      keyword: "dune",
      venue: ["colombo"],
    });
    expect(sessions.length).toBe(4);
    expect(sessions[0]).toMatchObject({
      date: "2026-12-15",
      theater: "Cinemas NOS Colombo",
    });
  });

  it("returns no sessions for a date without screenings", () => {
    const sessions = filterNosCinemasSessions(sessionsJson, {
      date: ["2026-12-19"],
      keyword: "dune",
      venue: ["colombo"],
    });
    expect(sessions).toEqual([]);
  });

  it("supports multiple venues", () => {
    const sessions = filterNosCinemasSessions(sessionsJson, {
      keyword: "dune",
      venue: ["colombo", "almada"],
    });
    expect(new Set(sessions.map((session) => session.theater))).toEqual(
      new Set(["Cinemas NOS Colombo", "Cinemas NOS Almada Forum"]),
    );
  });
});

describe("nosCinemas email", () => {
  const watch = { date: ["2026-12-15"], keyword: "dune", venue: ["colombo"] };
  const movie = {
    aggregateFormatNumber: "0f091424-58c7-4949-b17a-9d3b06c64069",
    title: "Dune - Duna: Parte Três",
    url: "https://www.cinemas.nos.pt/filmes/dune---duna--parte-tres-",
  };

  it("builds the subject and body", () => {
    const sessions = filterNosCinemasSessions(sessionsJson, watch);
    const { body, subject } = buildNosCinemasEmail(watch, [{ movie, sessions }]);
    expect(subject).toBe("[NOS Cinemas] dune: 4 sessions available");
    expect(body).toContain(movie.url);
    expect(body).toContain("Cinemas NOS Colombo");
    expect(body).toContain("dates: 2026-12-15 · venues: colombo");
  });

  it("derives the idempotency key from the matched session uuids", async () => {
    const sessions = filterNosCinemasSessions(sessionsJson, watch);
    const key = await getNosCinemasIdempotencyKey(watch, [{ movie, sessions }]);
    const sameKey = await getNosCinemasIdempotencyKey(watch, [
      { movie, sessions: [...sessions].reverse() },
    ]);
    const otherKey = await getNosCinemasIdempotencyKey(watch, [
      { movie, sessions: sessions.slice(1) },
    ]);

    expect(key).toMatch(/^nos-cinemas-dune-[0-9a-f]{64}$/);
    expect(sameKey).toBe(key);
    expect(otherKey).not.toBe(key);
  });
});

const noSleep = async () => {};

describe("nosCinemas request retries", () => {
  it("retries timeouts with exponential backoff and returns the first success", async () => {
    const delays: Array<number> = [];
    let attempts = 0;
    const result = await retryNosCinemasRequest(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        }
        return "ok";
      },
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });

  it("rethrows after the retry budget is spent", async () => {
    let attempts = 0;
    await expect(
      retryNosCinemasRequest(
        async () => {
          attempts++;
          throw new TypeError("fetch failed");
        },
        { retryCount: 2, sleep: noSleep },
      ),
    ).rejects.toThrow("fetch failed");
    expect(attempts).toBe(3);
  });

  it("does not retry non transient errors", async () => {
    let attempts = 0;
    await expect(
      retryNosCinemasRequest(
        async () => {
          attempts++;
          throw new Error("bad json");
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow("bad json");
    expect(attempts).toBe(1);
  });

  it("classifies failures", () => {
    expect(isRetryableNosCinemasFailure({ name: "TimeoutError" })).toBe(true);
    expect(isRetryableNosCinemasFailure({ name: "TypeError" })).toBe(true);
    expect(isRetryableNosCinemasFailure({ name: "Error" })).toBe(false);
    expect(isRetryableNosCinemasFailure({ name: "NosCinemasRequestError", status: 503 })).toBe(
      true,
    );
    expect(isRetryableNosCinemasFailure({ name: "NosCinemasRequestError", status: 404 })).toBe(
      false,
    );
  });
});
