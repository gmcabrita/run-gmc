export type XCredentials = {
  bearer: string;
  cookie: string;
  csrfToken: string;
};

export const PUBLIC_ACCOUNT_INDICES = [1, 2, 3] as const;
export type PublicAccountIndex = (typeof PUBLIC_ACCOUNT_INDICES)[number];

export function getDefaultCredentials(env: CloudflareBindings): XCredentials {
  return {
    bearer: env.X_BEARER,
    cookie: env.X_COOKIE,
    csrfToken: env.X_CSRF_TOKEN,
  };
}

export function getPublicAccountCredentials(
  env: CloudflareBindings,
  account: PublicAccountIndex,
): XCredentials {
  switch (account) {
    case 1:
      return {
        bearer: env.X1_BEARER,
        cookie: env.X1_COOKIE,
        csrfToken: env.X1_CSRF_TOKEN,
      };
    case 2:
      return {
        bearer: env.X2_BEARER,
        cookie: env.X2_COOKIE,
        csrfToken: env.X2_CSRF_TOKEN,
      };
    case 3:
      return {
        bearer: env.X3_BEARER,
        cookie: env.X3_COOKIE,
        csrfToken: env.X3_CSRF_TOKEN,
      };
  }
}

export function getRandomPublicAccountIndex(): PublicAccountIndex {
  return PUBLIC_ACCOUNT_INDICES[Math.floor(Math.random() * PUBLIC_ACCOUNT_INDICES.length)]!;
}

export function resolveCredentials(env: CloudflareBindings, isPublic: boolean): XCredentials {
  if (!isPublic) {
    return getDefaultCredentials(env);
  }

  return getPublicAccountCredentials(env, getRandomPublicAccountIndex());
}

export function buildXApiHeaders(
  credentials: XCredentials,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
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
    "x-csrf-token": credentials.csrfToken,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    cookie: credentials.cookie,
    ...extraHeaders,
  };
}
