import { describe, expect, it } from "vitest";
import { parse } from "./brokenBrowserBlog";
import html from "./__fixtures__/broken-browser-blog.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("brokenBrowserBlog scraper", () => {
  it("parses directory entries", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://brokenbrowser.com/blog/");
    expect(result.link).toBe("https://brokenbrowser.com/blog/");
    expect(result.title).toBe("Broken Browser Blog");
    expect(result.description).toBe("Broken Browser blog posts");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(4);
  });

  it("extracts link, title and date from slugs sorted newest first", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      id: "https://brokenbrowser.com/blog/2026-05-09-prerender-stealth-csp-bypass/",
      link: "https://brokenbrowser.com/blog/2026-05-09-prerender-stealth-csp-bypass/",
      title: "Prerender Stealth CSP Bypass",
      text: "Prerender Stealth CSP Bypass",
      datetime: new Date("2026-05-09T00:00:00.000Z"),
    });

    expect(result.entries[1]).toEqual({
      id: "https://brokenbrowser.com/blog/2024-11-12-detecting-chrome-extensions-without-console-noise/",
      link: "https://brokenbrowser.com/blog/2024-11-12-detecting-chrome-extensions-without-console-noise/",
      title: "Detecting Chrome Extensions Without Console Noise",
      text: "Detecting Chrome Extensions Without Console Noise",
      datetime: new Date("2024-11-12T00:00:00.000Z"),
    });

    expect(result.entries[2]).toEqual({
      id: "https://brokenbrowser.com/blog/2024-06-10-wasm-shared-memory-timer/",
      link: "https://brokenbrowser.com/blog/2024-06-10-wasm-shared-memory-timer/",
      title: "WASM Shared Memory Timer",
      text: "WASM Shared Memory Timer",
      datetime: new Date("2024-06-10T00:00:00.000Z"),
    });

    expect(result.entries[3]).toEqual({
      id: "https://brokenbrowser.com/blog/2006-02-17-uxss-object-createpopup-iframe/",
      link: "https://brokenbrowser.com/blog/2006-02-17-uxss-object-createpopup-iframe/",
      title: "UXSS Object Createpopup Iframe",
      text: "UXSS Object Createpopup Iframe",
      datetime: new Date("2006-02-17T00:00:00.000Z"),
    });
  });
});
