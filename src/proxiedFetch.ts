export interface ProxiedFetchEnv {
  HTTP_RELAY_URL: string;
  HTTP_RELAY_TOKEN: string;
}

export type ProxiedFetch = typeof fetch;

type RelayForwardedHeader = "User-Agent" | "Accept" | "Accept-Language" | "Referer";

const RELAY_FORWARDED_HEADERS: RelayForwardedHeader[] = [
  "User-Agent",
  "Accept",
  "Accept-Language",
  "Referer",
];

export function createProxiedFetch(env: ProxiedFetchEnv, fetcher: ProxiedFetch = fetch): ProxiedFetch {
  return (input, init) => {
    const targetRequest = new Request(input, init);
    const headers = new Headers({
      Authorization: `Bearer ${env.HTTP_RELAY_TOKEN}`,
      "x-target-url": targetRequest.url,
    });

    for (const header of RELAY_FORWARDED_HEADERS) {
      const value = targetRequest.headers.get(header);

      if (value !== null) {
        headers.set(header, value);
      }
    }

    return fetcher(env.HTTP_RELAY_URL, {
      method: targetRequest.method,
      headers,
      body: targetRequest.body,
      signal: targetRequest.signal,
    });
  };
}
