import { describe, it, expect } from "vitest";
import { parse } from "./marktestPodScope";
import html from "./__fixtures__/marktest-pod-scope.html";

describe("marktestPodScope scraper", () => {
  it("parses ranking from HTML", async () => {
    const response = new Response(html, {
      headers: { "Content-Type": "text/html" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://www.marktest.com/pod_scope/");
    expect(result.link).toBe("https://www.marktest.com/pod_scope/");
    expect(result.title).toBe("Marktest POD_SCOPE RANK");
    expect(result.description).toBe("Ranking Nacional de Podcasts Auditados");
    expect(result.language).toBe("pt");

    expect(result.entries.length).toBe(1);

    const entry = result.entries[0];
    expect(entry.id).toBe("Ranking de PODCASTS - novembro 2025 [03 nov - 30 nov]");
    expect(entry.link).toBe("https://www.marktest.com/pod_scope/?date=2025-11");
    expect(entry.title).toBe("Ranking de PODCASTS - novembro 2025 [03 nov - 30 nov]");
    expect(entry.text).toBe("Ranking de PODCASTS - novembro 2025 [03 nov - 30 nov]");
  });
});
