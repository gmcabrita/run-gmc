import { describe, expect, it } from "vitest";
import { parse } from "./peetBlog";
import html from "./__fixtures__/peet-blog.html";

describe("peetBlog scraper", () => {
  it("parses blog posts from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://blog.peet.ws/");
    expect(result.link).toBe("https://blog.peet.ws/");
    expect(result.title).toBe("Peter Pagenstedt");
    expect(result.description).toBe("notes on software, systems, and captchas");
    expect(result.language).toBe("en");

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      id: "https://blog.peet.ws/posts/rise-of-vibe-coded-anti-bot-systems",
      link: "https://blog.peet.ws/posts/rise-of-vibe-coded-anti-bot-systems",
      title: "the rise of vibe-coded anti-bot systems",
      text: "A look inside the wave of LLM-built anti-bot systems, using Fastly and Apple as examples.",
      datetime: new Date(Date.UTC(2026, 5, 4)),
    });
  });

  it("normalizes fallback date and title text", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.entries[1]).toEqual({
      id: "https://blog.peet.ws/posts/follow-up",
      link: "https://blog.peet.ws/posts/follow-up",
      title: "follow-up notes",
      text: "More notes on bot detection.",
      datetime: new Date(Date.UTC(2026, 5, 5)),
    });
  });
});
