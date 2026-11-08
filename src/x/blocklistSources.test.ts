import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "valibot";
import {
  buildListMembersUrl,
  clankwallSource,
  createXListMembersSource,
  nobotsSource,
  parseListMembersPage,
  UNAVAILABLE_LIST_MESSAGE,
} from "./blocklistSources";
import { XListMembersResponseSchema } from "./schemas";
import firstPage from "./__fixtures__/list-members-page.json";
import lastPage from "./__fixtures__/list-members-last-page.json";

const testEnv = { ...env, X_BEARER: "bearer", X_COOKIE: "ct0=csrf; auth_token=token" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clankwallSource", () => {
  it("parses the username list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("KaiBGR\ngrok\n\n"));
    expect(await clankwallSource.fetchTargets(testEnv)).toEqual({
      invalid: [],
      targets: [
        { kind: "screenName", screenName: "kaibgr" },
        { kind: "screenName", screenName: "grok" },
      ],
    });
  });

  it("throws on HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 500 }));
    await expect(clankwallSource.fetchTargets(testEnv)).rejects.toThrow("HTTP 500");
  });
});

describe("nobotsSource", () => {
  it("keeps suspects with a score of 80 or more", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json([
        { h: "Ultrademic", s: 94 },
        { h: "edge_case", s: 80 },
        { h: "human", s: 79 },
        { h: "bad name", s: 99 },
      ]),
    );
    expect(await nobotsSource.fetchTargets(testEnv)).toEqual({
      invalid: ["bad name"],
      targets: [
        { kind: "screenName", screenName: "ultrademic" },
        { kind: "screenName", screenName: "edge_case" },
      ],
    });
  });

  it("throws on HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 500 }));
    await expect(nobotsSource.fetchTargets(testEnv)).rejects.toThrow("HTTP 500");
  });
});

describe("X list members source", () => {
  it("reads user IDs and the bottom cursor", () => {
    expect(parseListMembersPage(parse(XListMembersResponseSchema, firstPage))).toEqual({
      nextCursor: "0|2117421357531660232",
      userIds: ["2115838373319307264", "2111907862699995136"],
    });
  });

  it("ends on a page with no members", () => {
    expect(parseListMembersPage(parse(XListMembersResponseSchema, lastPage))).toEqual({
      nextCursor: undefined,
      userIds: [],
    });
  });

  it("puts the list ID and cursor in the variables", () => {
    const url = new URL(buildListMembersUrl("123", "0|1"));
    expect(JSON.parse(url.searchParams.get("variables") ?? "")).toEqual({
      count: 100,
      cursor: "0|1",
      listId: "123",
    });
  });

  it("follows the cursor until a page has no members", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => Response.json(firstPage))
      .mockImplementationOnce(async () => Response.json(lastPage));

    expect(await createXListMembersSource("123").fetchTargets(testEnv)).toEqual({
      invalid: [],
      targets: [
        { kind: "userId", userId: "2115838373319307264" },
        { kind: "userId", userId: "2111907862699995136" },
      ],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchSpy.mock.calls[1][0]));
    expect(JSON.parse(secondUrl.searchParams.get("variables") ?? "").cursor).toBe(
      "0|2117421357531660232",
    );
  });

  it("returns no targets when the list does not exist or is private", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ data: { list: { members_timeline: {} } } }),
    );
    expect(await createXListMembersSource("123").fetchTargets(testEnv)).toEqual({
      invalid: [UNAVAILABLE_LIST_MESSAGE],
      targets: [],
    });
  });

  it("throws when a later page has no members timeline", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => Response.json(firstPage))
      .mockImplementationOnce(async () =>
        Response.json({ data: { list: { members_timeline: {} } } }),
      );
    await expect(createXListMembersSource("123").fetchTargets(testEnv)).rejects.toThrow(
      "no members timeline on page 2",
    );
  });

  it("throws when the response has no list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: {} }));
    await expect(createXListMembersSource("123").fetchTargets(testEnv)).rejects.toThrow();
  });

  it("throws on HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 429 }));
    await expect(createXListMembersSource("123").fetchTargets(testEnv)).rejects.toThrow("HTTP 429");
  });
});
