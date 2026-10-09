import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createRssHandler, escapeHtml, renderRssEntryContent } from "./scrapers";

describe("renderRssEntryContent", () => {
  it("adds the text paragraph when the entry has text", () => {
    expect(
      renderRssEntryContent({
        id: "1",
        imageURL: "https://example.com/image.png",
        link: "https://example.com/post",
        text: "Summary",
        title: "Post",
      }),
    ).toBe(
      '<p>Summary</p><a href="https://example.com/post">https://example.com/post</a><p><img src="https://example.com/image.png" alt="Post" /></p>',
    );
  });

  it("leaves out the text paragraph when the entry has no text", () => {
    expect(
      renderRssEntryContent({ id: "1", link: "https://example.com/post", title: "Post" }),
    ).toBe('<a href="https://example.com/post">https://example.com/post</a>');
  });
});

describe("renderRssEntryContent escaping", () => {
  it("escapes quotes and ampersands in the image alt text and URLs", () => {
    expect(
      renderRssEntryContent({
        id: "1",
        imageURL: "https://example.com/image.jpg?width=1300&format=webp",
        link: "https://example.com/post?a=1&b=2",
        title: 'Waitrose & Partners "It\'s not fine"',
      }),
    ).toBe(
      '<a href="https://example.com/post?a=1&amp;b=2">https://example.com/post?a=1&amp;b=2</a><p><img src="https://example.com/image.jpg?width=1300&amp;format=webp" alt="Waitrose &amp; Partners &quot;It\'s not fine&quot;" /></p>',
    );
  });
});

describe("createRssHandler", () => {
  it("adds a self link and puts description before content:encoded", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.get(
      "/rss.test",
      createRssHandler(async () => ({
        entries: [{ id: "1", link: "https://example.com/post", title: 'A "quoted" title' }],
        id: "https://example.com",
        language: "en",
        link: "https://example.com",
        title: "Test",
      })),
    );

    const xml = await (await app.request("https://run.example/rss.test")).text();

    expect(xml).toContain(
      '<atom:link href="https://run.example/rss.test" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).toContain(
      "<description><![CDATA[A &quot;quoted&quot; title]]></description>\n            <content:encoded>",
    );
  });
});

describe("escapeHtml", () => {
  it("keeps entities that a scraper already encoded", () => {
    expect(escapeHtml("Disney &amp; Pixar & Friends &#39;24")).toBe(
      "Disney &amp; Pixar &amp; Friends &#39;24",
    );
  });
});
