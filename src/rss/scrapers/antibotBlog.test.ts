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
      id: "https://antibot.blog/",
      link: "https://antibot.blog/",
      title: "antibot.blog",
      description: "A blog for reverse engineering code!",
      language: "en",
    });
    expect(result.entries).toHaveLength(3);
  });

  it("extracts and sorts posts newest first", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      id: "https://antibot.blog/posts/1773605197805",
      link: "https://antibot.blog/posts/1773605197805",
      title: "Reversing Akamai BMP 3.2.4 on Android",
      text: "Breaking down Akamai's mobile bot management SDK on Android - the encryption scheme, payload structure, and what it takes to generate valid sensor data at scale.",
      datetime: new Date("2026-03-15T00:00:00.000Z"),
    });

    expect(result.entries.map((entry) => entry.datetime)).toEqual([
      new Date("2026-03-15T00:00:00.000Z"),
      new Date("2025-10-23T00:00:00.000Z"),
      new Date("2025-03-13T00:00:00.000Z"),
    ]);
  });
});
