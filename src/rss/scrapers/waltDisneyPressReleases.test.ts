import { describe, it, expect } from "vitest";
import { parse } from "./waltDisneyPressReleases";
import html from "./__fixtures__/disney-press-releases.html";

function createResponse() {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("waltDisneyPressReleases scraper", () => {
  it("parses live page article cards", async () => {
    const result = await parse(createResponse());

    expect(result.id).toBe("https://thewaltdisneycompany.com/press-releases/");
    expect(result.link).toBe("https://thewaltdisneycompany.com/press-releases/");
    expect(result.title).toBe("Press Release Archives | The Walt Disney Company");
    expect(result.description).toBe(
      "Find announcements and updates from The Walt Disney Company and explore our archive of press releases.",
    );
    expect(result.language).toBe("en");
    expect(result.entries).toHaveLength(3);
  });

  it("parses title, link and datetime from a card", async () => {
    const result = await parse(createResponse());

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe(
      "https://thewaltdisneycompany.com/press-releases/the-walt-disney-company-to-participate-in-the-morgan-stanley-technology-media-telecom-conference/",
    );
    expect(firstEntry.link).toBe(
      "https://thewaltdisneycompany.com/press-releases/the-walt-disney-company-to-participate-in-the-morgan-stanley-technology-media-telecom-conference/",
    );
    expect(firstEntry.title).toBe(
      "The Walt Disney Company To Participate In The Morgan Stanley Technology, Media &amp; Telecom Conference",
    );
    expect(firstEntry.datetime).toEqual(new Date("2026-02-25T00:00:00+00:00"));
  });

  it("ignores feature-row cards and resolves relative links", async () => {
    const result = await parse(createResponse());

    const allLinks = result.entries.map((entry) => entry.link);
    expect(allLinks).not.toContain("https://thewaltdisneycompany.com/press-releases/featured-item/");
    expect(result.entries[1].link).toBe(
      "https://thewaltdisneycompany.com/press-releases/kristina-schake-to-depart-as-chief-communications-officer-of-the-walt-disney-company/",
    );
  });
});
