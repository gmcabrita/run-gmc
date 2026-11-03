import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildModerationRequestBody,
  getBlocklistCacheTtlSeconds,
  getErrorMessages,
  parseBlocklistLimit,
  parseScreenName,
  parseTargetList,
  parseUserId,
  runXBlocklist,
  selectPendingTargets,
  type BlocklistSource,
  type BlocklistTarget,
  type XBlocklistAccount,
} from "./blocklist";

const DAY_SECONDS = 24 * 60 * 60;

function screenName(name: string): BlocklistTarget {
  return { kind: "screenName", screenName: name };
}

function staticSource(targets: Array<BlocklistTarget>, name = "static"): BlocklistSource {
  return { fetchTargets: async () => ({ invalid: [], targets }), name };
}

const account: XBlocklistAccount = {
  credentials: { bearer: "bearer", cookie: "ct0=csrf; auth_token=token" },
  name: "test",
};

async function clearBlocklistCache() {
  const { keys } = await env.RUN_GMC_X_CACHE_KV.list({ prefix: "x.blocklist:" });
  await Promise.all(keys.map(({ name }) => env.RUN_GMC_X_CACHE_KV.delete(name)));
}

describe("x blocklist parsing", () => {
  it("parses and lowercases screen names", () => {
    expect(parseScreenName(" @KaiBGR ")).toEqual(screenName("kaibgr"));
    expect(parseScreenName("bad name")).toBeUndefined();
    expect(parseScreenName("waytoolongscreenname")).toBeUndefined();
  });

  it("parses numeric user IDs", () => {
    expect(parseUserId("1905895407588397056")).toEqual({
      kind: "userId",
      userId: "1905895407588397056",
    });
    expect(parseUserId("abc")).toBeUndefined();
  });

  it("skips blank lines and reports invalid lines", () => {
    expect(parseTargetList("a\r\n\nbad name\nb\n", parseScreenName)).toEqual({
      invalid: ["bad name"],
      targets: [screenName("a"), screenName("b")],
    });
  });
});

describe("x blocklist endpoint helpers", () => {
  it("parses the limit", () => {
    expect(parseBlocklistLimit(undefined)).toBe(75);
    expect(parseBlocklistLimit("400")).toBe(400);
    expect(parseBlocklistLimit("0")).toBeUndefined();
    expect(parseBlocklistLimit("1001")).toBeUndefined();
    expect(parseBlocklistLimit("1.5")).toBeUndefined();
    expect(parseBlocklistLimit("abc")).toBeUndefined();
  });

  it("lists error messages with causes", () => {
    const error = new AggregateError(
      [new Error("target failed", { cause: new Error("HTTP 500") }), "text"],
      "2 errors",
    );
    expect(getErrorMessages(error)).toEqual(["target failed: HTTP 500", "text"]);
  });
});

describe("x blocklist selection", () => {
  it("removes cached and duplicate targets and applies the limit", () => {
    const targets = [screenName("a"), screenName("b"), screenName("a"), screenName("c")];
    expect(selectPendingTargets(targets, new Set(["screenName:b"]), 1)).toEqual({
      deferred: 1,
      pending: [screenName("a")],
    });
  });

  it("keeps the cache TTL between 7 and 21 days", () => {
    expect(getBlocklistCacheTtlSeconds(() => 0)).toBe(7 * DAY_SECONDS);
    expect(getBlocklistCacheTtlSeconds(() => 1 - Number.EPSILON)).toBe(21 * DAY_SECONDS);
  });

  it("sends screen_name or user_id", () => {
    expect(buildModerationRequestBody(screenName("a")).toString()).toBe("screen_name=a");
    expect(buildModerationRequestBody({ kind: "userId", userId: "1" }).toString()).toBe(
      "user_id=1",
    );
  });
});

describe("runXBlocklist", () => {
  beforeEach(clearBlocklistCache);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mutes then blocks each target and skips it on the next run", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const sources = [staticSource([screenName("a"), screenName("b")])];

    const first = await runXBlocklist(env, sources, [account], { delayMs: 0 });
    expect(first).toEqual({
      accounts: { test: { deferred: 0, done: ["screenName:a", "screenName:b"], notFound: [] } },
      invalid: [],
    });
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      "https://x.com/i/api/1.1/mutes/users/create.json",
      "https://x.com/i/api/1.1/blocks/create.json",
      "https://x.com/i/api/1.1/mutes/users/create.json",
      "https://x.com/i/api/1.1/blocks/create.json",
    ]);
    const init = fetchSpy.mock.calls[0][1];
    expect(String(init?.body)).toBe("screen_name=a");
    expect(init?.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded",
      "x-csrf-token": "csrf",
    });

    const second = await runXBlocklist(env, sources, [account], { delayMs: 0 });
    expect(second).toEqual({
      accounts: { test: { deferred: 0, done: [], notFound: [] } },
      invalid: [],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("caches targets that X does not find and skips the block call", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 404 }));

    const result = await runXBlocklist(env, [staticSource([screenName("gone")])], [account], {
      delayMs: 0,
    });
    expect(result).toEqual({
      accounts: { test: { deferred: 0, done: [], notFound: ["screenName:gone"] } },
      invalid: [],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reports an error when every target returns 404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}", { status: 404 }),
    );
    const targets = ["a", "b", "c", "d", "e"].map(screenName);

    await expect(
      runXBlocklist(env, [staticSource(targets)], [account], { delayMs: 0 }),
    ).rejects.toThrow("1 X blocklist error(s)");
  });

  it("sends a browser user agent", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));

    await runXBlocklist(env, [staticSource([screenName("a")])], [account], { delayMs: 0 });
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      "user-agent": expect.stringContaining("Mozilla/5.0"),
    });
  });

  it("stops after a 429 and reports the error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("", { status: 429 }));

    await expect(
      runXBlocklist(env, [staticSource([screenName("a"), screenName("b")])], [account], {
        delayMs: 0,
      }),
    ).rejects.toThrow("1 X blocklist error(s)");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const { keys } = await env.RUN_GMC_X_CACHE_KV.list({ prefix: "x.blocklist:" });
    expect(keys).toEqual([]);
  });

  it("continues with other sources when one source fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}"));
    const failing: BlocklistSource = {
      fetchTargets: async () => {
        throw new Error("down");
      },
      name: "failing",
    };

    await expect(
      runXBlocklist(env, [failing, staticSource([screenName("a")])], [account], { delayMs: 0 }),
    ).rejects.toThrow("1 X blocklist error(s)");
    const { keys } = await env.RUN_GMC_X_CACHE_KV.list({ prefix: "x.blocklist:" });
    expect(keys.map(({ name }) => name)).toEqual(["x.blocklist:test:screenName:a"]);
  });
});
