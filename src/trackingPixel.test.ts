import { describe, expect, it } from "vitest";
import { createTrackingPixelResponse } from "./trackingPixel";

describe("createTrackingPixelResponse", () => {
  it("returns a non-empty 1px GIF while reporting a zero content length", async () => {
    const response = createTrackingPixelResponse();
    const body = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(body.buffer);

    expect(response.headers.get("Content-Type")).toBe("image/gif");
    expect(response.headers.get("Content-Length")).toBe("0");
    expect(body.byteLength).toBeGreaterThan(0);
    expect(view.getUint16(6, true)).toBe(1);
    expect(view.getUint16(8, true)).toBe(1);
  });
});
