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
      description: "Recent news from the SQLite project",
      id: "https://www.sqlite.org/news.html",
      language: "en",
      link: "https://www.sqlite.org/news.html",
      title: "Recent SQLite News",
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
      datetime: new Date("2026-06-26T00:00:00.000Z"),
      id: "https://www.sqlite.org/releaselog/3_53_3.html",
      link: "https://www.sqlite.org/releaselog/3_53_3.html",
      text: "SQLite version 3.53.3 is a maintenance patch release for 3.53.",
      title: "Version 3.53.3",
    });

    expect(result.entries[2]).toEqual({
      datetime: new Date("2026-04-09T00:00:00.000Z"),
      id: "https://www.sqlite.org/releaselog/3_53_0.html",
      link: "https://www.sqlite.org/releaselog/3_53_0.html",
      text: "SQLite version 3.53.0 fixes the WAL-reset bug. Upgrading is recommended.",
      title: "Version 3.53.0",
    });
  });

  it("falls back to the news anchor when a heading has no link", async () => {
    const result = await parse(createResponse());

    expect(result.entries[1]).toEqual({
      datetime: new Date("2026-05-05T00:00:00.000Z"),
      id: "https://www.sqlite.org/news.html#2026_05_05",
      link: "https://www.sqlite.org/news.html#2026_05_05",
      text: "A release without a linked heading.",
      title: "Patch release 3.53.1",
    });
  });
});
