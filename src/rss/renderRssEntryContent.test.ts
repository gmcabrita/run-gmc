import { describe, expect, it } from "vitest";
import { renderRssEntryContent } from "./scrapers";

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
