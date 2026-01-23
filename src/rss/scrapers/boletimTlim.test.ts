import { describe, it, expect } from "vitest";
import {
  fetchHtmlTitlesByPath,
  isHighEntropyHtmlName,
  parse,
  parseGithubContentsFiles,
  parsePtMonthYearFromTitle,
} from "./boletimTlim";
import json from "./__fixtures__/tlimpt-github-contents.json";

describe("boletimTlim parser", () => {
  it("filters high entropy html files", () => {
    const result = parse(json);

    expect(result.id).toBe("https://tlim.pt/");
    expect(result.link).toBe("https://tlim.pt/");
    expect(result.title).toBe("Boletim TLIM");
    expect(result.language).toBe("pt");

    expect(result.entries.map((e) => e.link)).toEqual([
      "https://tlim.pt/3EbyHfnz7PM9K2RHk.html",
      "https://tlim.pt/hioQHTk7Bu6bcRzHt34.html",
    ]);

    expect(result.entries.map((e) => e.title)).toEqual([
      "3EbyHfnz7PM9K2RHk.html",
      "hioQHTk7Bu6bcRzHt34.html",
    ]);

    expect(result.entries.map((e) => e.datetime)).toEqual([undefined, undefined]);
  });

  it("parses pt month+year", () => {
    expect(parsePtMonthYearFromTitle("x - Dezembro de 2025")).toEqual(
      new Date(Date.UTC(2025, 11, 1)),
    );
    expect(parsePtMonthYearFromTitle("x - Março de 2026")).toEqual(new Date(Date.UTC(2026, 2, 1)));
    expect(parsePtMonthYearFromTitle("no date here")).toBeNull();
  });

  it("uses html <title> for entry title", async () => {
    const files = parseGithubContentsFiles(json).filter((f) => isHighEntropyHtmlName(f.name));

    const fetchFn: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "https://example.com/1") {
        return new Response(
          "<html><head><title>Boletim 1 - Dezembro de 2025</title></head></html>",
        );
      }
      if (url === "https://example.com/2") {
        return new Response("<html><head><title>Boletim 2 - Janeiro de 2026</title></head></html>");
      }

      return new Response("", { status: 404 });
    };

    const titlesByPath = await fetchHtmlTitlesByPath(files, fetchFn);
    const result = parse(json, titlesByPath);

    expect(result.entries.map((e) => e.title)).toEqual([
      "Boletim 1 - Dezembro de 2025",
      "Boletim 2 - Janeiro de 2026",
    ]);

    expect(result.entries.map((e) => e.datetime)).toEqual([
      new Date(Date.UTC(2025, 11, 1)),
      new Date(Date.UTC(2026, 0, 1)),
    ]);
  });

  it("handles non-array payload", () => {
    const result = parse({});
    expect(result.entries).toEqual([]);
  });
});
