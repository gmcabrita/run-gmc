import { describe, expect, it } from "vitest";
import {
  createPrivateProfileNoticeFeed,
  getTimelineEntries,
  hasAccessibleTimeline,
} from "./feed";

describe("x feed helpers", () => {
  it("detects missing timelines", () => {
    expect(hasAccessibleTimeline({ data: { user: { result: {} } } } as never)).toBe(false);
  });

  it("detects accessible timelines", () => {
    expect(
      hasAccessibleTimeline({
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [{ entries: [] }],
                },
              },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("returns empty entries when timeline is missing", () => {
    expect(getTimelineEntries({ data: { user: { result: {} } } } as never)).toEqual([]);
  });

  it("creates a private profile notice feed", () => {
    const feed = createPrivateProfileNoticeFeed("someuser");
    const rss = feed.rss2();

    expect(rss).toContain("Profile is now private");
    expect(rss).toContain("remove");
    expect(rss).toContain("public=true");
    expect(rss).toContain("/rss.x?userName=someuser");
  });
});
