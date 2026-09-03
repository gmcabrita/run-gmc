import { ValiError } from "valibot";
import { describe, expect, it } from "vitest";
import html from "./__fixtures__/colossus-articles.html";
import { parse, scrape } from "./colossusArticles";

const AJAX_URL = "https://colossus.com/wp/wp-admin/admin-ajax.php";

function createAjaxResponse(): Response {
  return Response.json({
    data: {
      html,
      totalPosts: 35,
    },
    success: true,
  });
}

const failedFetcher: typeof fetch = async () => new Response(null, { status: 503 });
const unsuccessfulFetcher: typeof fetch = async () =>
  Response.json({ data: { html }, success: false });

describe("colossusArticles scraper", () => {
  it("parses Colossus article cards", async () => {
    const result = await parse(html);

    expect(result).toMatchObject({
      description:
        "Definitive accounts of investors, founders, companies, and the people and ideas that inspire them",
      id: "https://colossus.com/mag/",
      language: "en",
      link: "https://colossus.com/mag/",
      title: "Colossus Magazine",
    });
    expect(result.entries).toEqual([
      {
        id: "https://colossus.com/article/michael-moritz-memoir/",
        imageURL: "https://colossus.com/wp-content/uploads/2026/08/moritz.png",
        link: "https://colossus.com/article/michael-moritz-memoir/",
        text: "An excerpt from the author's new memoir | By Michael Moritz",
        title: "The Wretched & Refuse",
      },
      {
        id: "https://colossus.com/article/guinness/",
        imageURL: "https://colossus.com/wp-content/uploads/2026/08/guinness.png",
        link: "https://colossus.com/article/guinness/",
        text: "By Alex Bilmes",
        title: "Lovely Day for the Black Stuff",
      },
    ]);
  });

  it("requests the first 35 reviews as multipart form data", async () => {
    const requests: Array<Request> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return createAjaxResponse();
    };

    const result = await scrape(fetchFn);

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.url).toBe(AJAX_URL);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("accept")).toBe("*/*");
    expect(request?.headers.get("content-type")).toContain("multipart/form-data; boundary=");
    expect(request?.headers.get("user-agent")).toContain("Chrome/152.0.0.0");
    expect(Object.fromEntries((await request?.formData()) ?? [])).toEqual({
      action: "articles_load_more",
      page: "1",
      post_id: "",
      posts_per_page: "35",
      type: "review",
    });
    expect(result.entries).toHaveLength(2);
  });

  it("reports failed requests", async () => {
    await expect(scrape(failedFetcher)).rejects.toThrow("Colossus articles request failed: 503");
  });

  it("rejects unsuccessful API payloads", async () => {
    await expect(scrape(unsuccessfulFetcher)).rejects.toBeInstanceOf(ValiError);
  });
});
