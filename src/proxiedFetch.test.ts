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

    expect(request.url).toBe(relayEnv.HTTP_RELAY_URL);
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("payload");
    expect(headers.get("Authorization")).toBe(`Bearer ${relayEnv.HTTP_RELAY_TOKEN}`);
    expect(headers.get("x-target-url")).toBe("https://target.example.com/api");
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
});
