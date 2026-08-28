export interface ProxiedFetchEnv {
  HTTP_RELAY_TOKEN: string;
  HTTP_RELAY_URL: string;
}

export type ProxiedFetch = typeof fetch;

export interface ProxiedFetchOptions {
  baseDelayMs?: number;
  jitterDelayMs?: number;
  random?: () => number;
  retryCount?: number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

interface RelayRetryPolicy {
  baseDelayMs: number;
  jitterDelayMs: number;
  random: () => number;
  retryCount: number;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

type RelayForwardedHeader =
  | "User-Agent"
  | "Accept"
  | "Accept-Language"
  | "Referer"
  | "Cookie"
  | "Sec-CH-UA"
  | "Sec-CH-UA-Mobile"
  | "Sec-CH-UA-Platform"
  | "Upgrade-Insecure-Requests"
  | "Sec-Fetch-Site"
  | "Sec-Fetch-Mode"
  | "Sec-Fetch-User"
  | "Sec-Fetch-Dest"
  | "Priority";

const RELAY_RETRY_COUNT = 3;
const RELAY_RETRY_BASE_DELAY_MS = 250;
const RELAY_RETRY_JITTER_DELAY_MS = 250;

const RELAY_FORWARDED_HEADERS: Array<RelayForwardedHeader> = [
  "User-Agent",
  "Accept",
  "Accept-Language",
  "Referer",
  "Cookie",
  "Sec-CH-UA",
  "Sec-CH-UA-Mobile",
  "Sec-CH-UA-Platform",
  "Upgrade-Insecure-Requests",
  "Sec-Fetch-Site",
  "Sec-Fetch-Mode",
  "Sec-Fetch-User",
  "Sec-Fetch-Dest",
  "Priority",
];

function getRelayRequestUrl(relayUrl: string, targetUrl: string): string {
  const separator = relayUrl.endsWith("/") ? "" : "/";

  return `${relayUrl}${separator}${targetUrl}`;
}

function isRetryableRelayStatus(status: number): boolean {
  return status === 502 || status === 525;
}

function getRelayRetryDelayMs(policy: RelayRetryPolicy, retryIndex: number): number {
  const exponentialDelayMs = policy.baseDelayMs * 2 ** retryIndex;
  const jitterDelayMs = Math.floor(policy.random() * policy.jitterDelayMs);

  return exponentialDelayMs + jitterDelayMs;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);

    function abort() {
      clearTimeout(timeout);
      reject(signal.reason);
    }

    signal.addEventListener("abort", abort, { once: true });
  });
}

function getRelayRetryPolicy(options: ProxiedFetchOptions | undefined): RelayRetryPolicy {
  return {
    baseDelayMs: options?.baseDelayMs ?? RELAY_RETRY_BASE_DELAY_MS,
    jitterDelayMs: options?.jitterDelayMs ?? RELAY_RETRY_JITTER_DELAY_MS,
    random: options?.random ?? Math.random,
    retryCount: options?.retryCount ?? RELAY_RETRY_COUNT,
    sleep: options?.sleep ?? sleep,
  };
}

function createRelayRequestInit(env: ProxiedFetchEnv, targetRequest: Request): RequestInit {
  const headers = new Headers({
    Authorization: `Bearer ${env.HTTP_RELAY_TOKEN}`,
  });

  for (const header of RELAY_FORWARDED_HEADERS) {
    const value = targetRequest.headers.get(header);

    if (value !== null) {
      headers.set(header, value);
    }
  }

  return {
    body: targetRequest.body,
    headers,
    method: targetRequest.method,
    signal: targetRequest.signal,
  };
}

async function fetchRelayRequest(
  env: ProxiedFetchEnv,
  fetcher: ProxiedFetch,
  targetRequest: Request,
): Promise<Response> {
  return fetcher(
    getRelayRequestUrl(env.HTTP_RELAY_URL, targetRequest.url),
    createRelayRequestInit(env, targetRequest),
  );
}

export function createProxiedFetch(
  env: ProxiedFetchEnv,
  fetcher: ProxiedFetch = fetch,
  options?: ProxiedFetchOptions,
): ProxiedFetch {
  return async (input, init) => {
    const targetRequest = new Request(input, init);
    const retryPolicy = getRelayRetryPolicy(options);

    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchRelayRequest(env, fetcher, targetRequest.clone());

      if (!isRetryableRelayStatus(response.status) || attempt >= retryPolicy.retryCount) {
        return response;
      }

      await retryPolicy.sleep(getRelayRetryDelayMs(retryPolicy, attempt), targetRequest.signal);
    }
  };
}
