export type XCredentials = {
  bearer: string;
  cookie: string;
};

export const PUBLIC_ACCOUNT_INDICES = [1, 2, 3] as const;
export type PublicAccountIndex = (typeof PUBLIC_ACCOUNT_INDICES)[number];
type XCredentialsBindings = Pick<
  CloudflareBindings,
  "X_BEARER" | "X_COOKIE" | "X1_COOKIE" | "X2_COOKIE" | "X3_COOKIE"
>;

function getCookieValue(cookie: string, name: string): string | undefined {
  for (const part of cookie.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=");
    if (rawName === name) return valueParts.join("=");
  }
}

export function getCsrfTokenFromCookie(cookie: string): string {
  const csrfToken = getCookieValue(cookie, "ct0");
  if (!csrfToken) throw new Error("X cookie missing ct0");

  return csrfToken;
}

export function getDefaultCredentials(env: XCredentialsBindings): XCredentials {
  return {
    bearer: env.X_BEARER,
    cookie: env.X_COOKIE,
  };
}

export function getPublicAccountCredentials(
  env: XCredentialsBindings,
  account: PublicAccountIndex,
): XCredentials {
  switch (account) {
    case 1:
      return {
        bearer: env.X_BEARER,
        cookie: env.X1_COOKIE,
      };
    case 2:
      return {
        bearer: env.X_BEARER,
        cookie: env.X2_COOKIE,
      };
    case 3:
      return {
        bearer: env.X_BEARER,
        cookie: env.X3_COOKIE,
      };
  }
}

export function getRandomPublicAccountIndex(): PublicAccountIndex {
  const index = Math.floor(Math.random() * PUBLIC_ACCOUNT_INDICES.length);

  switch (index) {
    case 0:
      return 1;
    case 1:
      return 2;
    default:
      return 3;
  }
}

export function resolveCredentials(env: XCredentialsBindings, isPublic: boolean): XCredentials {
  if (!isPublic) {
    return getDefaultCredentials(env);
  }

  return getPublicAccountCredentials(env, getRandomPublicAccountIndex());
}

export function buildXApiHeaders(
  credentials: XCredentials,
  extraHeaders: Record<string, string> = {},
) {
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
    authorization: `Bearer ${credentials.bearer}`,
    "content-type": "application/json",
    dnt: "1",
    priority: "u=1, i",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-csrf-token": getCsrfTokenFromCookie(credentials.cookie),
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    cookie: credentials.cookie,
    ...extraHeaders,
  };
}
