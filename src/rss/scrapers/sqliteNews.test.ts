import { describe, expect, it } from "vitest";
import { parse } from "./sqliteNews";
import html from "./__fixtures__/sqlite-news.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("sqliteNews scraper", () => {
  it("parses and sorts SQLite news entries", async () => {
    const result = await parse(createResponse());

    expect(result).toMatchObject({
      id: "https://www.sqlite.org/news.html",
      link: "https://www.sqlite.org/news.html",
      title: "Recent SQLite News",
      description: "Recent news from the SQLite project",
      language: "en",
    });
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Version 3.53.3",
      "Patch release 3.53.1",
      "Version 3.53.0",
    ]);
  });

  it("extracts release links, descriptions, and UTC dates", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      id: "https://www.sqlite.org/releaselog/3_53_3.html",
      link: "https://www.sqlite.org/releaselog/3_53_3.html",
      title: "Version 3.53.3",
      text: "SQLite version 3.53.3 is a maintenance patch release for 3.53.",
      datetime: new Date("2026-06-26T00:00:00.000Z"),
    });

    expect(result.entries[2]).toEqual({
      id: "https://www.sqlite.org/releaselog/3_53_0.html",
      link: "https://www.sqlite.org/releaselog/3_53_0.html",
      title: "Version 3.53.0",
      text: "SQLite version 3.53.0 fixes the WAL-reset bug. Upgrading is recommended.",
      datetime: new Date("2026-04-09T00:00:00.000Z"),
    });
  });

  it("falls back to the news anchor when a heading has no link", async () => {
    const result = await parse(createResponse());

    expect(result.entries[1]).toEqual({
      id: "https://www.sqlite.org/news.html#2026_05_05",
      link: "https://www.sqlite.org/news.html#2026_05_05",
      title: "Patch release 3.53.1",
      text: "A release without a linked heading.",
      datetime: new Date("2026-05-05T00:00:00.000Z"),
    });
  });
});
