import type { CoverflexAuthResponse } from "@types";

const KV_TOKEN_KEY = "coverflex:token";
const KV_REFRESH_TOKEN_KEY = "coverflex:refresh_token";
const EXPIRY_BUFFER_SECONDS = 600; // 10 minutes

interface JwtPayload {
  exp: number;
}

function parseJwtExpiration(token: string): number {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  const payload = JSON.parse(atob(parts[1])) as JwtPayload;
  return payload.exp;
}

function getExpirationTtl(token: string): number {
  const exp = parseJwtExpiration(token);
  const now = Math.floor(Date.now() / 1000);
  const ttl = exp - now - EXPIRY_BUFFER_SECONDS;
  return Math.max(ttl, 0);
}

async function storeTokens(kv: KVNamespace, token: string, refreshToken: string): Promise<void> {
  const tokenTtl = getExpirationTtl(token);
  const refreshTokenTtl = getExpirationTtl(refreshToken);

  const puts: Array<Promise<void>> = [];

  if (tokenTtl > 0) {
    puts.push(kv.put(KV_TOKEN_KEY, token, { expirationTtl: tokenTtl }));
  }

  if (refreshTokenTtl > 0) {
    puts.push(kv.put(KV_REFRESH_TOKEN_KEY, refreshToken, { expirationTtl: refreshTokenTtl }));
  }

  await Promise.all(puts);
}

async function refreshSession(refreshToken: string): Promise<CoverflexAuthResponse> {
  const response = await fetch("https://menhir-api.coverflex.com/api/employee/sessions/renew", {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
      "content-type": "application/json",
      authorization: `Bearer ${refreshToken}`,
      priority: "u=1, i",
      "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Refresh failed: ${response.status}`);
  }

  return response.json() as Promise<CoverflexAuthResponse>;
}

async function loginWithCredentials(env: CloudflareBindings): Promise<CoverflexAuthResponse> {
  const response = await fetch("https://menhir-api.coverflex.com/api/employee/sessions", {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
      "content-type": "application/json",
      priority: "u=1, i",
      "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    },
    body: JSON.stringify({
      email: env.COVERFLEX_EMAIL,
      password: env.COVERFLEX_PASSWORD,
      user_agent_token: env.COVERFLEX_USER_AGENT_TOKEN,
    }),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  return response.json() as Promise<CoverflexAuthResponse>;
}

export async function getAuthenticationToken(env: CloudflareBindings): Promise<string> {
  const kv = env.RUN_GMC_GENERIC_CACHE_KV;

  // Try cached token first
  const cachedToken = await kv.get(KV_TOKEN_KEY);
  if (cachedToken) {
    return cachedToken;
  }

  // Try refresh token
  const cachedRefreshToken = await kv.get(KV_REFRESH_TOKEN_KEY);
  if (cachedRefreshToken) {
    try {
      const authResponse = await refreshSession(cachedRefreshToken);
      await storeTokens(kv, authResponse.token, authResponse.refresh_token);
      return authResponse.token;
    } catch {
      // Refresh failed, fall through to full login
    }
  }

  // Full login
  const authResponse = await loginWithCredentials(env);
  await storeTokens(kv, authResponse.token, authResponse.refresh_token);
  return authResponse.token;
}
