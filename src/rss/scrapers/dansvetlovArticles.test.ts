import { describe, expect, it } from "vitest";
import { parse } from "./dansvetlovArticles";
import html from "./__fixtures__/dansvetlov-articles.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("dansvetlovArticles scraper", () => {
  it("parses article cards", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://dansvetlov.me/articles/");
    expect(result.link).toBe("https://dansvetlov.me/articles/");
    expect(result.title).toBe("Articles | dansvetlov.me");
    expect(result.description).toBe(
      "I enjoy spending time yak shaving a little too much, and at some point, I realized that my personal notes documenting the architecture, design decisions, and implementation details of popular software might be interesting to others. Thus, this blog was born.",
    );
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(3);
  });

  it("extracts title, summary, date and image", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      datetime: new Date("2025-03-14T00:00:00.000Z"),
      id: "https://dansvetlov.me/postgres-anomalies/",
      imageURL: "https://dansvetlov.me/images/articles/postgres-anomalies/masthead.jpg",
      link: "https://dansvetlov.me/postgres-anomalies/",
      text: "Exploring the isolation anomalies possible at each PostgreSQL transaction isolation level, and practical strategies to deal with them.",
      title: "A Practical Guide to Taming Postgres Isolation Anomalies",
    });

    expect(result.entries[1]).toEqual({
      datetime: new Date("2024-12-30T00:00:00.000Z"),
      id: "https://dansvetlov.me/puma-internals/",
      imageURL: undefined,
      link: "https://dansvetlov.me/puma-internals/",
      text: "Taking a comprehensive look at how Puma, one of the most popular Ruby web servers, works under the hood.",
      title: "Dissecting Puma: Anatomy of a Ruby Web Server",
    });

    expect(result.entries[2]).toEqual({
      datetime: new Date("2024-02-04T00:00:00.000Z"),
      id: "https://dansvetlov.me/sidekiq-internals/",
      imageURL: undefined,
      link: "https://dansvetlov.me/sidekiq-internals/",
      text: "An investigation into the internals of Sidekiq, one of the most popular Ruby background job processors.",
      title: "How does Sidekiq really work?",
    });
  });
});
