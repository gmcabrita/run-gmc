import { describe, expect, it } from "vitest";
import { createProxiedFetch } from "./proxiedFetch";

const relayEnv = {
  HTTP_RELAY_URL: "https://relay.example.com/fetch",
  HTTP_RELAY_TOKEN: "relay-token",
};

function requireRelayRequest(input: RequestInfo | URL | undefined, init: RequestInit | undefined) {
  if (input === undefined || init === undefined) {
    throw new Error("relay fetch was not called");
  }

  return new Request(input, init);
}

describe("createProxiedFetch", () => {
  it("routes through the relay with method, body, and whitelisted headers", async () => {
    let relayInput: RequestInfo | URL | undefined;
    let relayInit: RequestInit | undefined;

    const fetcher: typeof fetch = async (input, init) => {
      relayInput = input;
      relayInit = init;
      return new Response("ok");
    };

    await createProxiedFetch(relayEnv, fetcher)("https://target.example.com/api", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-PT",
        Referer: "https://target.example.com/",
      },
      body: "payload",
    });

    const request = requireRelayRequest(relayInput, relayInit);
    const headers = request.headers;

    expect(request.url).toBe("https://relay.example.com/fetch/https://target.example.com/api");
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("payload");
    expect(headers.get("Authorization")).toBe(`Bearer ${relayEnv.HTTP_RELAY_TOKEN}`);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Accept-Language")).toBe("pt-PT");
    expect(headers.get("Referer")).toBe("https://target.example.com/");
    expect(headers.get("User-Agent")).toBeNull();
  });

  it("does not forward arbitrary target headers", async () => {
    let relayInput: RequestInfo | URL | undefined;
    let relayInit: RequestInit | undefined;

    const fetcher: typeof fetch = async (input, init) => {
      relayInput = input;
      relayInit = init;
      return new Response("ok");
    };

    await createProxiedFetch(relayEnv, fetcher)("https://target.example.com/api", {
      headers: {
        "x-api-key": "target-secret",
      },
    });

    const request = requireRelayRequest(relayInput, relayInit);

    expect(request.headers.get("x-api-key")).toBeNull();
  });

  it("does not add a duplicate slash when the relay URL already ends with one", async () => {
    let relayInput: RequestInfo | URL | undefined;
    let relayInit: RequestInit | undefined;

    const fetcher: typeof fetch = async (input, init) => {
      relayInput = input;
      relayInit = init;
      return new Response("ok");
    };

    await createProxiedFetch(
      {
        ...relayEnv,
        HTTP_RELAY_URL: "https://relay.example.com/fetch/",
      },
      fetcher,
    )("https://target.example.com/api");

    const request = requireRelayRequest(relayInput, relayInit);

    expect(request.url).toBe("https://relay.example.com/fetch/https://target.example.com/api");
  });

  it("retries relay 502 responses with exponential backoff and jitter", async () => {
    const delays: number[] = [];
    const requestBodies: string[] = [];
    let calls = 0;

    const fetcher: typeof fetch = async (input, init) => {
      calls += 1;
      requestBodies.push(await requireRelayRequest(input, init).text());

      if (calls === 1) {
        return new Response("bad gateway", { status: 502 });
      }

      return new Response("ok");
    };

    const response = await createProxiedFetch(relayEnv, fetcher, {
      baseDelayMs: 100,
      jitterDelayMs: 10,
      random: () => 0.5,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    })("https://target.example.com/api", {
      method: "POST",
      body: "payload",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(calls).toBe(2);
    expect(delays).toStrictEqual([105]);
    expect(requestBodies).toStrictEqual(["payload", "payload"]);
  });

  it("retries relay 525 responses up to 3 times", async () => {
    const delays: number[] = [];
    let calls = 0;

    const fetcher: typeof fetch = async () => {
      calls += 1;
      return new Response("ssl handshake failed", { status: 525 });
    };

    const response = await createProxiedFetch(relayEnv, fetcher, {
      baseDelayMs: 100,
      jitterDelayMs: 10,
      random: () => 0,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    })("https://target.example.com/api");

    expect(response.status).toBe(525);
    expect(calls).toBe(4);
    expect(delays).toStrictEqual([100, 200, 400]);
  });
});
