import { number, object, parse } from "valibot";
import { CoverflexAuthResponseSchema, type CoverflexAuthResponse } from "../schemas";

const JwtPayloadSchema = object({
  exp: number(),
});

const KV_TOKEN_KEY = "coverflex:token";
const KV_REFRESH_TOKEN_KEY = "coverflex:refresh_token";
const EXPIRY_BUFFER_SECONDS = 600; // 10 minutes

function parseJwtExpiration(token: string): number {
  const parts = token.split(".");
  const encodedPayload = parts[1];
  if (parts.length !== 3 || !encodedPayload) {
    throw new Error("Invalid JWT format");
  }

  return parse(JwtPayloadSchema, JSON.parse(atob(encodedPayload))).exp;
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
      authorization: `Bearer ${refreshToken}`,
      "content-type": "application/json",
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

  return parse(CoverflexAuthResponseSchema, await response.json());
}

async function loginWithCredentials(env: CloudflareBindings): Promise<CoverflexAuthResponse> {
  const response = await fetch("https://menhir-api.coverflex.com/api/employee/sessions", {
    body: JSON.stringify({
      email: env.COVERFLEX_EMAIL,
      password: env.COVERFLEX_PASSWORD,
      user_agent_token: env.COVERFLEX_USER_AGENT_TOKEN,
    }),
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
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  return parse(CoverflexAuthResponseSchema, await response.json());
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
