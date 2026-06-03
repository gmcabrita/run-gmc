import { describe, expect, it, vi } from "vitest";
import {
  getDefaultCredentials,
  getPublicAccountCredentials,
  getRandomPublicAccountIndex,
  resolveCredentials,
} from "./credentials";

function createEnv(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    X_BEARER: "default-bearer",
    X_COOKIE: "default-cookie",
    X_CSRF_TOKEN: "default-csrf",
    X1_BEARER: "x1-bearer",
    X1_COOKIE: "x1-cookie",
    X1_CSRF_TOKEN: "x1-csrf",
    X2_BEARER: "x2-bearer",
    X2_COOKIE: "x2-cookie",
    X2_CSRF_TOKEN: "x2-csrf",
    X3_BEARER: "x3-bearer",
    X3_COOKIE: "x3-cookie",
    X3_CSRF_TOKEN: "x3-csrf",
    ...overrides,
  } as CloudflareBindings;
}

describe("x credentials", () => {
  it("returns default credentials when public is false", () => {
    const env = createEnv();

    expect(resolveCredentials(env, false)).toEqual({
      bearer: "default-bearer",
      cookie: "default-cookie",
      csrfToken: "default-csrf",
    });
  });

  it("returns public account credentials", () => {
    const env = createEnv();

    expect(getPublicAccountCredentials(env, 2)).toEqual({
      bearer: "x2-bearer",
      cookie: "x2-cookie",
      csrfToken: "x2-csrf",
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
      bearer: "x2-bearer",
      cookie: "x2-cookie",
      csrfToken: "x2-csrf",
    });
  });

  it("returns default credentials from helper", () => {
    const env = createEnv();

    expect(getDefaultCredentials(env)).toEqual({
      bearer: "default-bearer",
      cookie: "default-cookie",
      csrfToken: "default-csrf",
    });
  });
});
