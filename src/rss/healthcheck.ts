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
  passed: boolean;
  statusCode: number;
  url: string;
}

export interface RssHealthcheckFetchResult {
  body: string;
  ok: boolean;
  statusCode: number;
}

export type FetchRssHealthcheckUrl = (url: string) => Promise<RssHealthcheckFetchResult>;

export interface RssHealthcheckFailure {
  statusCode: number;
  url: string;
}

export interface RssHealthcheckResponse {
  failures: Array<RssHealthcheckFailure>;
  summary: {
    failed: number;
    passed: number;
  };
}

export interface DiscordEmbedField {
  inline?: boolean;
  name: string;
  value: string;
}

export interface DiscordEmbed {
  color: number;
  description?: string;
  fields?: Array<DiscordEmbedField>;
  title: string;
}

export interface DiscordWebhookPayload {
  embeds: Array<DiscordEmbed>;
}

const discordFailureColor = 0xff_3b_30;
const discordPassColor = 0x34_c7_59;
const discordEmbedFieldLimit = 25;
const discordEmbedLimit = 10;

export function getRssHealthcheckFailureReason(
  response: RssHealthcheckResponse,
): string | undefined {
  return response.failures.length === 0 ? undefined : JSON.stringify(response.failures);
}

export function getDiscordHealthcheckFailureMessage(reason: string): string {
  return `run.gmc healthcheck failed: ${reason}`;
}

export function getDiscordHealthcheckPassMessage(): string {
  return "run.gmc healthcheck passed";
}

export function getDiscordHealthcheckFailurePayload(
  response: RssHealthcheckResponse,
): DiscordWebhookPayload {
  const visibleFailures = response.failures.slice(0, discordEmbedFieldLimit * discordEmbedLimit);
  const overflowCount = response.failures.length - visibleFailures.length;
  const fields = visibleFailures.map(formatRssHealthcheckFailureField);
  const embeds: Array<DiscordEmbed> = [];

  for (let index = 0; index < fields.length; index += discordEmbedFieldLimit) {
    const isFirstEmbed = index === 0;
    embeds.push({
      color: discordFailureColor,
      description: isFirstEmbed ? formatHealthcheckSummary(response, overflowCount) : undefined,
      fields: fields.slice(index, index + discordEmbedFieldLimit),
      title: isFirstEmbed ? "run.gmc healthcheck failed" : "More healthcheck failures",
    });
  }

  return {
    embeds,
  };
}

export function getDiscordHealthcheckErrorPayload(reason: string): DiscordWebhookPayload {
  return {
    embeds: [
      {
        color: discordFailureColor,
        description: reason,
        title: "run.gmc healthcheck failed",
      },
    ],
  };
}

export function getDiscordHealthcheckPassPayload(
  response: RssHealthcheckResponse,
): DiscordWebhookPayload {
  return {
    embeds: [
      {
        color: discordPassColor,
        description: `${response.summary.passed} checks passed`,
        title: "run.gmc healthcheck passed",
      },
    ],
  };
}

export function getHttpRelayHealthcheckUrl(httpRelayUrl: string): string {
  return `${httpRelayUrl.replace(/\/+$/, "")}/healthz`;
}

function formatHealthcheckSummary(response: RssHealthcheckResponse, overflowCount: number): string {
  const summary = `${response.summary.failed} failed, ${response.summary.passed} passed`;
  return overflowCount === 0
    ? summary
    : `${summary}. Showing first ${response.failures.length - overflowCount}.`;
}

function formatRssHealthcheckFailureField(failure: RssHealthcheckFailure): DiscordEmbedField {
  return {
    inline: false,
    name: `${failure.statusCode} ${getUrlPathname(failure.url)}`,
    value: `<${failure.url}>`,
  };
}

function getUrlPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function getRssHealthcheckPaths(routes: ReadonlyArray<RouteLike>): Array<string> {
  return [...new Set(routes.filter((route) => route.method === "GET").map((route) => route.path))]
    .filter((path) => path.startsWith("/rss."))
    .filter((path) => !rssHealthcheckExcludedPaths.has(path))
    .sort();
}

export function rssFeedHasAtLeastOneEntry(body: string): boolean {
  return /<item(?:\s|>)/.test(body);
}

export async function runRssHealthcheck(
  paths: ReadonlyArray<string>,
  origin: string,
  fetchUrl: FetchRssHealthcheckUrl,
  extraUrls: ReadonlyArray<string> = [],
): Promise<RssHealthcheckResponse> {
  const checks: Array<Promise<RssHealthcheckResult>> = [
    ...paths.map(async (path) => {
      const url = new URL(path, origin).toString();

      try {
        const response = await fetchUrl(url);

        return {
          passed: response.ok && rssFeedHasAtLeastOneEntry(response.body),
          statusCode: response.statusCode,
          url,
        };
      } catch {
        return {
          passed: false,
          statusCode: 500,
          url,
        };
      }
    }),
    ...extraUrls.map(async (url) => {
      try {
        const response = await fetchUrl(url);

        return {
          passed: response.ok,
          statusCode: response.statusCode,
          url,
        };
      } catch {
        return {
          passed: false,
          statusCode: 500,
          url,
        };
      }
    }),
  ];

  const results = await Promise.all(checks);

  return summarizeRssHealthcheck(results);
}

export function summarizeRssHealthcheck(
  results: ReadonlyArray<RssHealthcheckResult>,
): RssHealthcheckResponse {
  const failures = results
    .filter((result) => !result.passed)
    .map((result) => ({
      url: result.url,
      // Keep the established JSON field order used in healthcheck messages.
      statusCode: result.statusCode,
    }));

  return {
    failures,
    summary: {
      failed: failures.length,
      passed: results.length - failures.length,
    },
  };
}
