export const rssHealthcheckExcludedPaths = new Set([
  "/rss.x",
  "/rss.cacheAgendaLx",
  "/rss.sendCinecartazEntriesByEmail",
  "/rss.sendCinemaxRtpPassatemposEntriesByEmail",
  "/rss.discordQuests",
]);

export interface RouteLike {
  method: string;
  path: string;
}

export interface RssHealthcheckResult {
  url: string;
  statusCode: number;
  passed: boolean;
}

export interface RssHealthcheckFailure {
  url: string;
  statusCode: number;
}

export interface RssHealthcheckResponse {
  summary: {
    passed: number;
    failed: number;
  };
  failures: RssHealthcheckFailure[];
}

export function getRssHealthcheckFailureReason(
  response: RssHealthcheckResponse,
): string | undefined {
  return response.failures.length === 0 ? undefined : JSON.stringify(response.failures);
}

export function getPokeHealthcheckFailureMessage(reason: string): string {
  return `run.gmc healthcheck failed: ${reason}`;
}

export function getRssHealthcheckPaths(routes: ReadonlyArray<RouteLike>): string[] {
  return [
    ...new Set(
      routes
        .filter((route) => route.method === "GET")
        .map((route) => route.path),
    ),
  ]
    .filter((path) => path.startsWith("/rss."))
    .filter((path) => !rssHealthcheckExcludedPaths.has(path))
    .sort();
}

export function rssFeedHasAtLeastOneEntry(body: string): boolean {
  return /<item(?:\s|>)/.test(body);
}

export function summarizeRssHealthcheck(
  results: ReadonlyArray<RssHealthcheckResult>,
): RssHealthcheckResponse {
  const failures = results
    .filter((result) => !result.passed)
    .map((result) => ({
      url: result.url,
      statusCode: result.statusCode,
    }));

  return {
    summary: {
      passed: results.length - failures.length,
      failed: failures.length,
    },
    failures,
  };
}
