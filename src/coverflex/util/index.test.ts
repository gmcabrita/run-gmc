import { describe, expect, it } from "vitest";
import { parse } from "valibot";
import { CoverflexRenewResponseSchema } from "../schemas";
import { toCoverflexAuthResponse } from "./index";

describe("Coverflex renew response", () => {
  it("maps the nested renew tokens to the login token shape", () => {
    const body = { data: { access_token: "access", refresh_token: "refresh" } };

    expect(toCoverflexAuthResponse(parse(CoverflexRenewResponseSchema, body))).toEqual({
      refresh_token: "refresh",
      token: "access",
    });
  });

  it("rejects the top-level login shape", () => {
    expect(() =>
      parse(CoverflexRenewResponseSchema, { refresh_token: "refresh", token: "access" }),
    ).toThrow();
  });
});
