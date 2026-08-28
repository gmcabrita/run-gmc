import { describe, expect, it, vi } from "vitest";
import {
  buildXApiHeaders,
  getDefaultCredentials,
  getCsrfTokenFromCookie,
  getPublicAccountCredentials,
  getRandomPublicAccountIndex,
  resolveCredentials,
} from "./credentials";

type TestEnv = Parameters<typeof resolveCredentials>[0];

function createEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    X_BEARER: "bearer",
    X_COOKIE: "guest_id=default; ct0=default-csrf; auth_token=default",
    X1_COOKIE: "guest_id=x1; ct0=x1-csrf; auth_token=x1",
    X2_COOKIE: "guest_id=x2; ct0=x2-csrf; auth_token=x2",
    X3_COOKIE: "guest_id=x3; ct0=x3-csrf; auth_token=x3",
    ...overrides,
  };
}

describe("x credentials", () => {
  it("returns default credentials when public is false", () => {
    const env = createEnv();

    expect(resolveCredentials(env, false)).toEqual({
      bearer: "bearer",
      cookie: "guest_id=default; ct0=default-csrf; auth_token=default",
    });
  });

  it("returns public account credentials", () => {
    const env = createEnv();

    expect(getPublicAccountCredentials(env, 2)).toEqual({
      bearer: "bearer",
      cookie: "guest_id=x2; ct0=x2-csrf; auth_token=x2",
    });
  });

  it("picks a random public account index", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);

    expect(getRandomPublicAccountIndex()).toBe(3);
  });

  it("uses a random public account when public is true", () => {
    const env = createEnv();
    vi.spyOn(Math, "random").mockReturnValue(0.4);

    expect(resolveCredentials(env, true)).toEqual({
      bearer: "bearer",
      cookie: "guest_id=x2; ct0=x2-csrf; auth_token=x2",
    });
  });

  it("returns default credentials from helper", () => {
    const env = createEnv();

    expect(getDefaultCredentials(env)).toEqual({
      bearer: "bearer",
      cookie: "guest_id=default; ct0=default-csrf; auth_token=default",
    });
  });

  it("reads csrf token from cookie", () => {
    expect(getCsrfTokenFromCookie("guest_id=v; ct0=csrf-token; auth_token=v")).toBe("csrf-token");
  });

  it("sets csrf header from cookie", () => {
    expect(
      buildXApiHeaders({
        bearer: "bearer",
        cookie: "guest_id=v; ct0=csrf-token; auth_token=v",
      })["x-csrf-token"],
    ).toBe("csrf-token");
  });

  it("requires csrf token in cookie", () => {
    expect(() => getCsrfTokenFromCookie("guest_id=v; auth_token=v")).toThrow(
      "X cookie missing ct0",
    );
  });
});
