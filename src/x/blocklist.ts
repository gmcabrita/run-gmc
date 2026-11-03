import { buildXApiHeaders, getDefaultCredentials, type XCredentials } from "./credentials";

// Mutes and blocks X accounts that come from one or more blocklist sources.
//
// Each source returns targets by screen name or by numeric user ID. A cron
// run every 30 minutes mutes and blocks each target with each configured X account. The
// default is only the main account (`X_COOKIE`). After a target is done for an
// account, a KV entry skips it for that account for 7 to 21 days.
// The random TTL spreads expiries so the targets do not all expire on the same
// day. Each run handles at most `X_BLOCKLIST_MAX_TARGETS_PER_RUN` targets per account to
// stay below X rate limits. Targets above the limit wait for a later run.
// Logs show that X allows about 187 mute requests in a 15-minute window for each
// account, and 404 responses count. 175 leaves a margin for mutes from the browser.
// 48 runs a day at 175 targets each gives 8400 targets a day for each account.

export type BlocklistTarget =
  | { kind: "screenName"; screenName: string }
  | { kind: "userId"; userId: string };

export type BlocklistTargetList = {
  // Entries that did not parse, kept so the run result can show them.
  invalid: Array<string>;
  targets: Array<BlocklistTarget>;
};

export type BlocklistSource = {
  fetchTargets: (env: Env) => Promise<BlocklistTargetList>;
  name: string;
};

export type BlocklistAccountResult = {
  // Targets left for a later run because of the per-run limit or a 429.
  deferred: number;
  done: Array<string>;
  notFound: Array<string>;
};

export type BlocklistRunResult = {
  accounts: Record<string, BlocklistAccountResult>;
  invalid: Array<string>;
};

export type BlocklistPendingTargets = {
  deferred: number;
  pending: Array<BlocklistTarget>;
};

type XModerationEndpoint = {
  // Copied from a browser request. Other X calls in this repo reuse a fixed value too.
  transactionId: string;
  url: string;
};

const X_MUTE_ENDPOINT: XModerationEndpoint = {
  transactionId:
    "I6pqb6JxK0GT5il3BQEZ5KLn0yCpBHTCUSzX2VjO6Zwlu/srBSgwH4NXwV0a0R7rHPDruiWr1bGJGuRMT0ih+7+l4xemIA",
  url: "https://x.com/i/api/1.1/mutes/users/create.json",
};

const X_BLOCK_ENDPOINT: XModerationEndpoint = {
  transactionId:
    "3VSUkVyP1b9tGNeJ+//nGlwZLd5X+oo8r9IpJ6YwF2LbRQXV+9bO4X2pP6PkL+AV4gsVRNstIgdT8Ro0oOMkdS+0hbzU3g",
  url: "https://x.com/i/api/1.1/blocks/create.json",
};

export const X_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const X_BLOCKLIST_CACHE_PREFIX = "x.blocklist:";
const X_BLOCKLIST_MIN_TTL_SECONDS = 7 * 24 * 60 * 60;
const X_BLOCKLIST_MAX_TTL_SECONDS = 21 * 24 * 60 * 60;
export const X_BLOCKLIST_MAX_TARGETS_PER_RUN = 175;
const X_BLOCKLIST_DELAY_BETWEEN_TARGETS_MS = 1000;
// See `isLikelyRejectedByX`.
const X_BLOCKLIST_MIN_NOT_FOUND_FOR_ALERT = 5;

// X screen names: 1 to 15 letters, digits, or underscores.
const X_SCREEN_NAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const X_USER_ID_PATTERN = /^\d{1,20}$/;

export class XRateLimitedError extends Error {
  constructor(url: string) {
    super(`X rate limited ${url}`);
    this.name = "XRateLimitedError";
  }
}

export function parseScreenName(value: string): BlocklistTarget | undefined {
  const screenName = value.trim().replace(/^@/, "");
  if (!X_SCREEN_NAME_PATTERN.test(screenName)) {
    return undefined;
  }
  // X screen names are not case sensitive. Lowercase them so cache keys match.
  return { kind: "screenName", screenName: screenName.toLowerCase() };
}

export function parseUserId(value: string): BlocklistTarget | undefined {
  const userId = value.trim();
  return X_USER_ID_PATTERN.test(userId) ? { kind: "userId", userId } : undefined;
}

// Parses a text list with one entry for each line. Blank lines are skipped.
// Lines that do not parse are returned so the caller can report them.
export function parseTargetList(
  text: string,
  parseLine: (line: string) => BlocklistTarget | undefined,
): BlocklistTargetList {
  const targets: Array<BlocklistTarget> = [];
  const invalid: Array<string> = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }
    const target = parseLine(line);
    if (target) {
      targets.push(target);
    } else {
      invalid.push(line);
    }
  }
  return { invalid, targets };
}

export function getBlocklistTargetKey(target: BlocklistTarget): string {
  switch (target.kind) {
    case "screenName":
      return `screenName:${target.screenName}`;
    case "userId":
      return `userId:${target.userId}`;
  }
}

// Removes duplicate and cached targets, then keeps at most `limit` targets.
export function selectPendingTargets(
  targets: ReadonlyArray<BlocklistTarget>,
  cachedKeys: ReadonlySet<string>,
  limit: number,
): BlocklistPendingTargets {
  const seen = new Set<string>();
  const pending: Array<BlocklistTarget> = [];
  for (const target of targets) {
    const key = getBlocklistTargetKey(target);
    if (cachedKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    pending.push(target);
  }
  return { deferred: Math.max(0, pending.length - limit), pending: pending.slice(0, limit) };
}

export function getBlocklistCacheTtlSeconds(random: () => number = Math.random): number {
  const range = X_BLOCKLIST_MAX_TTL_SECONDS - X_BLOCKLIST_MIN_TTL_SECONDS;
  return X_BLOCKLIST_MIN_TTL_SECONDS + Math.floor(random() * (range + 1));
}

export function buildModerationRequestBody(target: BlocklistTarget): URLSearchParams {
  switch (target.kind) {
    case "screenName":
      return new URLSearchParams({ screen_name: target.screenName });
    case "userId":
      return new URLSearchParams({ user_id: target.userId });
  }
}

type ModerationOutcome = "done" | "notFound";

async function postModeration(
  credentials: XCredentials,
  endpoint: XModerationEndpoint,
  target: BlocklistTarget,
): Promise<ModerationOutcome> {
  const response = await fetch(endpoint.url, {
    body: buildModerationRequestBody(target),
    headers: buildXApiHeaders(credentials, {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://x.com",
      // X returns 404 (code 34) to these endpoints for clients that are not browsers,
      // for example `user-agent: node`.
      "user-agent": X_BROWSER_USER_AGENT,
      "x-client-transaction-id": endpoint.transactionId,
    }),
    method: "POST",
  });

  if (response.status === 429) {
    throw new XRateLimitedError(endpoint.url);
  }
  // X returns 404 (code 34) for accounts that do not exist. Retrying them each day only
  // uses up rate limit. X also returns the same 404 when it rejects the request,
  // for example a request with a User-Agent that is not a browser. See `isLikelyRejectedByX`.
  if (response.status === 404) {
    return "notFound";
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`X ${endpoint.url} returned HTTP ${response.status}: ${body}`);
  }
  return "done";
}

export async function muteAndBlockXUser(
  credentials: XCredentials,
  target: BlocklistTarget,
): Promise<ModerationOutcome> {
  if ((await postModeration(credentials, X_MUTE_ENDPOINT, target)) === "notFound") {
    return "notFound";
  }
  return postModeration(credentials, X_BLOCK_ENDPOINT, target);
}

export type XBlocklistAccount = {
  credentials: XCredentials;
  // Part of the cache key, so each account keeps its own record of done targets.
  name: string;
};

export function getDefaultBlocklistAccounts(env: Env): Array<XBlocklistAccount> {
  return [{ credentials: getDefaultCredentials(env), name: "default" }];
}

function getBlocklistCachePrefix(account: XBlocklistAccount): string {
  return `${X_BLOCKLIST_CACHE_PREFIX}${account.name}:`;
}

// A 404 for each target and no success means that X probably rejected the
// requests. If all the accounts did not exist, the result would be the same, but that is improbable.
export function isLikelyRejectedByX(result: BlocklistAccountResult): boolean {
  return result.done.length === 0 && result.notFound.length >= X_BLOCKLIST_MIN_NOT_FOUND_FOR_ALERT;
}

const X_BLOCKLIST_MAX_LIMIT = 1000;

// Parses the `limit` query parameter of the manual run endpoint.
export function parseBlocklistLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return X_BLOCKLIST_MAX_TARGETS_PER_RUN;
  }
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const limit = Number(value);
  return limit >= 1 && limit <= X_BLOCKLIST_MAX_LIMIT ? limit : undefined;
}

// Lists each error message with its causes, for example
// `X blocklist target "screenName:a" failed: X rate limited ...`.
export function getErrorMessages(error: Error): Array<string> {
  const errors = error instanceof AggregateError ? error.errors : [error];
  return errors.map((entry) => {
    const messages: Array<string> = [];
    let current: unknown = entry;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    return messages.length > 0 ? messages.join(": ") : String(entry);
  });
}

async function listCachedBlocklistKeys(kv: KVNamespace, prefix: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await kv.list({ cursor, prefix });
    for (const { name } of page.keys) {
      keys.add(name.slice(prefix.length));
    }
    if (page.list_complete) {
      return keys;
    }
    cursor = page.cursor;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchBlocklistTargets(env: Env, sources: ReadonlyArray<BlocklistSource>) {
  const errors: Array<Error> = [];
  const invalid: Array<string> = [];
  const targets: Array<BlocklistTarget> = [];
  for (const source of sources) {
    try {
      const list = await source.fetchTargets(env);
      targets.push(...list.targets);
      invalid.push(...list.invalid.map((entry) => `${source.name}: ${entry}`));
    } catch (error) {
      errors.push(new Error(`X blocklist source "${source.name}" failed`, { cause: error }));
    }
  }
  return { errors, invalid, targets };
}

type BlocklistRunOptions = { delayMs?: number; limit?: number };

async function runXBlocklistForAccount(
  kv: KVNamespace,
  account: XBlocklistAccount,
  targets: ReadonlyArray<BlocklistTarget>,
  { delayMs, limit }: Required<BlocklistRunOptions>,
): Promise<{ errors: Array<Error>; result: BlocklistAccountResult }> {
  const prefix = getBlocklistCachePrefix(account);
  const cachedKeys = await listCachedBlocklistKeys(kv, prefix);
  const { deferred, pending } = selectPendingTargets(targets, cachedKeys, limit);
  const result: BlocklistAccountResult = { deferred, done: [], notFound: [] };
  const errors: Array<Error> = [];

  for (const [index, target] of pending.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    const key = getBlocklistTargetKey(target);
    try {
      const outcome = await muteAndBlockXUser(account.credentials, target);
      await kv.put(`${prefix}${key}`, outcome, { expirationTtl: getBlocklistCacheTtlSeconds() });
      result[outcome].push(key);
    } catch (error) {
      errors.push(
        new Error(`X blocklist target "${key}" failed for account "${account.name}"`, {
          cause: error,
        }),
      );
      if (error instanceof XRateLimitedError) {
        // More requests would also get 429. Leave the remaining targets for the next run.
        result.deferred += pending.length - index - 1;
        break;
      }
    }
  }

  if (isLikelyRejectedByX(result)) {
    errors.push(
      new Error(
        `X blocklist got 404 for all ${result.notFound.length} targets for account "${account.name}". X probably rejected the requests. Delete the "${prefix}" KV entries after the fix.`,
      ),
    );
  }

  return { errors, result };
}

// A failure in one source, account, or target does not stop the others. All
// failures are thrown together at the end so the Sentry cron monitor marks the
// run as failed.
export async function runXBlocklist(
  env: Env,
  sources: ReadonlyArray<BlocklistSource>,
  accounts: ReadonlyArray<XBlocklistAccount> = getDefaultBlocklistAccounts(env),
  {
    delayMs = X_BLOCKLIST_DELAY_BETWEEN_TARGETS_MS,
    limit = X_BLOCKLIST_MAX_TARGETS_PER_RUN,
  }: BlocklistRunOptions = {},
): Promise<BlocklistRunResult> {
  const { errors, invalid, targets } = await fetchBlocklistTargets(env, sources);
  const results: Record<string, BlocklistAccountResult> = {};

  for (const account of accounts) {
    const run = await runXBlocklistForAccount(env.RUN_GMC_X_CACHE_KV, account, targets, {
      delayMs,
      limit,
    });
    results[account.name] = run.result;
    errors.push(...run.errors);
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length} X blocklist error(s)`);
  }
  return { accounts: results, invalid };
}
