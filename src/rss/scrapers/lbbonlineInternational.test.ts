import { describe, it, expect } from "vitest";
import { parse } from "./lbbonlineInternational";
import json from "./__fixtures__/lbbonline-international.json";

describe("lbbonlineInternational json parser", () => {
  it("parses posts from JSON", async () => {
    const result = await parse(json);

    expect(result.id).toBe("https://lbbonline.com/news?edition=international");
    expect(result.link).toBe("https://lbbonline.com/news?edition=international");
    expect(result.title).toBe("Little Black Book");
    expect(result.description).toBe("Little Black Book");
    expect(result.language).toBe("en");

    // Should have 3 entries (future post filtered out)
    expect(result.entries.length).toBe(3);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("abc123");
    expect(firstEntry.link).toBe("https://lbbonline.com/news/test-campaign-title");
    expect(firstEntry.title).toBe("Test Campaign Title");
    expect(firstEntry.text).toBe("This is a test campaign description for LBB Online.");
    expect(firstEntry.imageURL).toBe("https://d3q27bh1u24u2o.cloudfront.net/images/test-image.jpg");
    expect(firstEntry.datetime).toEqual(new Date("2025-12-28T10:00:00Z"));
  });

  it("handles posts without images", async () => {
    const result = await parse(json);

    const entryWithoutImage = result.entries.find((e) => e.id === "ghi789");
    expect(entryWithoutImage).toBeDefined();
    expect(entryWithoutImage?.imageURL).toBeUndefined();
  });

  it("filters out future posts", async () => {
    const result = await parse(json);

    const futureEntry = result.entries.find((e) => e.id === "future123");
    expect(futureEntry).toBeUndefined();
  });

  it("extracts all required fields from entries", async () => {
    const result = await parse(json);

    for (const entry of result.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.link).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.datetime).toBeInstanceOf(Date);
    }
  });
});
