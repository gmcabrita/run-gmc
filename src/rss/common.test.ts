import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, stripInvalidXmlChars } from "@rss/common";

describe("decodeHtmlEntities", () => {
  it("decodes named and numeric HTML entities", () => {
    expect(decodeHtmlEntities("&quot;Almada &amp; Sul&#39; &#x1f3ad;&hellip;&quot;")).toBe(
      '"Almada & Sul\' 🎭…"',
    );
  });

  it("leaves unsupported and invalid entities unchanged", () => {
    expect(decodeHtmlEntities("&copy; &#99999999;")).toBe("&copy; &#99999999;");
  });
});

describe("stripInvalidXmlChars", () => {
  it("removes xml-invalid control characters", () => {
    expect(stripInvalidXmlChars("a\u0002b\u0000c")).toBe("abc");
  });

  it("keeps valid xml characters", () => {
    expect(stripInvalidXmlChars("line 1\nline 2\t😀")).toBe("line 1\nline 2\t😀");
  });
});
