import { describe, it, expect } from "vitest";
import { parse } from "./mfeMediaForEuropeDocuments";
import html from "./__fixtures__/mfe-media-for-europe-documents.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("mfeMediaForEuropeDocuments scraper", () => {
  it("parses document cards from the first page", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://www.mfemediaforeurope.com/view/document_search/en?pageIndex=1");
    expect(result.link).toBe(
      "https://www.mfemediaforeurope.com/view/document_search/en?pageIndex=1",
    );
    expect(result.title).toBe("MFE-MEDIAFOREUROPE - Document Search");
    expect(result.description).toBe("Latest documents published by MFE-MEDIAFOREUROPE.");
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(3);
  });

  it("parses relative pdf links and datetimes", async () => {
    const result = await parse(createResponse());

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe(
      "https://www.mfemediaforeurope.com/binary/documentRepository/41/Press%20Release_2485.pdf",
    );
    expect(firstEntry.link).toBe(
      "https://www.mfemediaforeurope.com/binary/documentRepository/41/Press%20Release_2485.pdf",
    );
    expect(firstEntry.title).toBe("SUBSCRIPTION BY MFE OF A 32.9% STAKE IN IMPRESA");
    expect(firstEntry.text).toBe("SUBSCRIPTION BY MFE OF A 32.9% STAKE IN IMPRESA");
    expect(firstEntry.datetime).toBeInstanceOf(Date);
    expect(firstEntry.datetime?.getFullYear()).toBe(2026);
    expect(firstEntry.datetime?.getMonth()).toBe(2);
    expect(firstEntry.datetime?.getDate()).toBe(10);
    expect(firstEntry.datetime?.getHours()).toBe(18);
    expect(firstEntry.datetime?.getMinutes()).toBe(43);
  });

  it("ignores cards without a downloadable document", async () => {
    const result = await parse(createResponse());

    expect(result.entries.map((entry) => entry.title)).not.toContain("INVALID CARD WITHOUT PDF");
  });
});
