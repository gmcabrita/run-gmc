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

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
}

export interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

const discordFailureColor = 0xff3b30;
const discordPassColor = 0x34c759;
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
  const embeds: DiscordEmbed[] = [];

  for (let index = 0; index < fields.length; index += discordEmbedFieldLimit) {
    const isFirstEmbed = index === 0;
    embeds.push({
      title: isFirstEmbed ? "run.gmc healthcheck failed" : "More healthcheck failures",
      description: isFirstEmbed
        ? formatHealthcheckSummary(response, overflowCount)
        : undefined,
      color: discordFailureColor,
      fields: fields.slice(index, index + discordEmbedFieldLimit),
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
        title: "run.gmc healthcheck failed",
        description: reason,
        color: discordFailureColor,
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
        title: "run.gmc healthcheck passed",
        description: `${response.summary.passed} feeds passed`,
        color: discordPassColor,
      },
    ],
  };
}

function formatHealthcheckSummary(response: RssHealthcheckResponse, overflowCount: number): string {
  const summary = `${response.summary.failed} failed, ${response.summary.passed} passed`;
  return overflowCount === 0
    ? summary
    : `${summary}. Showing first ${response.failures.length - overflowCount}.`;
}

function formatRssHealthcheckFailureField(failure: RssHealthcheckFailure): DiscordEmbedField {
  return {
    name: `${failure.statusCode} ${getUrlPathname(failure.url)}`,
    value: `<${failure.url}>`,
    inline: false,
  };
}

function getUrlPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
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
