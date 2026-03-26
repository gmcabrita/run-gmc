import { describe, expect, it } from "vitest";
import { stripInvalidXmlChars } from "@rss/common";

describe("stripInvalidXmlChars", () => {
  it("removes xml-invalid control characters", () => {
    expect(stripInvalidXmlChars("a\u0002b\u0000c")).toBe("abc");
  });

  it("keeps valid xml characters", () => {
    expect(stripInvalidXmlChars("line 1\nline 2\t😀")).toBe("line 1\nline 2\t😀");
  });
});
