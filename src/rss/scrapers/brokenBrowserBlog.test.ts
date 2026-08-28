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

    expect(result.id).toBe("https://brokenbrowser.com/");
    expect(result.link).toBe("https://brokenbrowser.com/");
    expect(result.title).toBe("Broken Browser Blog");
    expect(result.description).toBe("Broken Browser blog posts");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(4);
  });

  it("extracts link, title and date from slugs sorted newest first", async () => {
    const result = await parse(createResponse());

    expect(result.entries[0]).toEqual({
      datetime: new Date("2026-05-09T00:00:00.000Z"),
      id: "https://brokenbrowser.com/blog/2026-05-09-prerender-stealth-csp-bypass/",
      link: "https://brokenbrowser.com/blog/2026-05-09-prerender-stealth-csp-bypass/",
      text: "Stealth Request That Bypasses CSP, Hides from DevTools, and Leaks the Real User-Agent",
      title:
        "Stealth Request That Bypasses CSP, Hides from DevTools, and Leaks the Real User-Agent",
    });

    expect(result.entries[1]).toEqual({
      datetime: new Date("2024-11-12T00:00:00.000Z"),
      id: "https://brokenbrowser.com/blog/2024-11-12-detecting-chrome-extensions-without-console-noise/",
      link: "https://brokenbrowser.com/blog/2024-11-12-detecting-chrome-extensions-without-console-noise/",
      text: "Detecting Chrome Extensions Without Console Noise",
      title: "Detecting Chrome Extensions Without Console Noise",
    });

    expect(result.entries[2]).toEqual({
      datetime: new Date("2024-06-10T00:00:00.000Z"),
      id: "https://brokenbrowser.com/blog/2024-06-10-wasm-shared-memory-timer/",
      link: "https://brokenbrowser.com/blog/2024-06-10-wasm-shared-memory-timer/",
      text: "Building a High-Resolution Timer from WebAssembly.Memory",
      title: "Building a High-Resolution Timer from WebAssembly.Memory",
    });

    expect(result.entries[3]).toEqual({
      datetime: new Date("2006-02-17T00:00:00.000Z"),
      id: "https://brokenbrowser.com/blog/2006-02-17-uxss-object-createpopup-iframe/",
      link: "https://brokenbrowser.com/blog/2006-02-17-uxss-object-createpopup-iframe/",
      text: "UXSS via object.createPopup and an iFrame",
      title: "UXSS via object.createPopup and an iFrame",
    });
  });
});
