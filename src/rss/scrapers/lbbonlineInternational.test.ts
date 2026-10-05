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

    // Should have 4 entries (future post filtered out)
    expect(result.entries.length).toBe(4);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe("154711");
    expect(firstEntry.link).toBe(
      "https://lbbonline.com/news/farmschool-d-stepping-out-of-the-classroom-and-into-something-wilder",
    );
    expect(firstEntry.title).toBe(
      "'FARM SCHOOL’D': Stepping Out of the Classroom and into Something Wilder",
    );
    expect(firstEntry.text).toBeUndefined();
    expect(firstEntry.imageURL).toBe(
      "https://d3q27bh1u24u2o.cloudfront.net/news/2026-10/farm-schoold-farmuse.TwvzJ-MH.png",
    );
    expect(firstEntry.datetime).toEqual(new Date("2026-10-05T18:10:00.000Z"));
  });

  it("handles posts without images", async () => {
    const result = await parse(json);

    const entryWithoutImage = result.entries.find((e) => e.id === "154706");
    expect(entryWithoutImage).toBeDefined();
    expect(entryWithoutImage?.imageURL).toBeUndefined();
  });

  it("filters out future posts", async () => {
    const result = await parse(json);

    const futureEntry = result.entries.find((e) => e.id === "999999");
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
