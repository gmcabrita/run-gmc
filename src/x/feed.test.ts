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
              rest_id: "1",
              legacy: {
                screen_name: "someuser",
                name: "Some User",
              },
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
              rest_id: "1",
              legacy: {
                screen_name: "someuser",
                name: "Some User",
                protected: true,
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
