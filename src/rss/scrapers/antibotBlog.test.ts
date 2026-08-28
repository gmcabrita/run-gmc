import { describe, expect, it } from "vitest";
import { parse } from "./antibotBlog";
import html from "./__fixtures__/antibot-blog.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("antibotBlog scraper", () => {
  it("parses blog metadata and filters non-post cards", async () => {
    const result = await parse(createResponse());

    expect(result).toMatchObject({
      description: "A blog for reverse engineering code!",
      id: "https://antibot.blog/",
      language: "en",
      link: "https://antibot.blog/",
      title: "antibot.blog",
    });
    expect(result.entries).toHaveLength(3);
  });

  it("extracts and sorts posts newest first", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-03-15T00:00:00.000Z"),
      id: "https://antibot.blog/posts/1773605197805",
      link: "https://antibot.blog/posts/1773605197805",
      text: "Breaking down Akamai's mobile bot management SDK on Android - the encryption scheme, payload structure, and what it takes to generate valid sensor data at scale.",
      title: "Reversing Akamai BMP 3.2.4 on Android",
    });

    expect(result.entries.map((entry) => entry.datetime)).toEqual([
      new Date("2026-03-15T00:00:00.000Z"),
      new Date("2025-10-23T00:00:00.000Z"),
      new Date("2025-03-13T00:00:00.000Z"),
    ]);
  });
});
