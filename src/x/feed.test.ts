import { describe, expect, it } from "vitest";
import {
  createPrivateProfileNoticeFeed,
  getTimelineEntries,
  isProtectedProfile,
} from "./feed";

describe("x feed helpers", () => {
  it("detects public profiles", () => {
    expect(
      isProtectedProfile({
        data: {
          user: {
            result: {
              legacy: {
                name: "Some User",
                screen_name: "someuser",
              },
              rest_id: "1",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("detects protected profiles", () => {
    expect(
      isProtectedProfile({
        data: {
          user: {
            result: {
              legacy: {
                name: "Some User",
                protected: true,
                screen_name: "someuser",
              },
              rest_id: "1",
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("returns empty entries when timeline is missing", () => {
    expect(getTimelineEntries({ data: { user: { result: {} } } })).toEqual([]);
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
