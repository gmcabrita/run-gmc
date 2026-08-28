import { Hono, type ExecutionContext as HonoExecutionContext } from "hono";
import { consoleLoggingIntegration, withMonitor, withSentry } from "@sentry/cloudflare";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { addCoverflexEndpoints, sendAppleCatalogueByEmail } from "@coverflex";
import { sendCinecartazEntriesByEmail } from "@rss/scrapers/cinecartaz";
import { sendCinemaxRtpPassatemposEntriesByEmail } from "@rss/scrapers/cinemaxRtpPassatempos";
import { addXEndpoints } from "@x";
import { addIcs2GcalEndpoint } from "./ics2gcal";
import { checkMauserSc1176StockAndNotify } from "./mauser";
import { addScrapedRssEndpoints, cacheAgendaLx } from "@rss/scrapers";
import { array, boolean, looseObject, nullish, parse, string, type InferOutput } from "valibot";
import {
  getDiscordHealthcheckErrorPayload,
  getDiscordHealthcheckFailurePayload,
  getDiscordHealthcheckPassPayload,
  getHttpRelayHealthcheckUrl,
  getRssHealthcheckPaths,
  runRssHealthcheck,
  type DiscordWebhookPayload,
  type RssHealthcheckFetchResult,
  type RssHealthcheckResponse,
} from "@rss/healthcheck";

const rssHealthcheckOrigin = "https://run.gmcabrita.com";
const FertagusTrainSchema = looseObject({
  ComboioPassou: boolean(),
  DataHoraPartidaChegada_ToOrderBy: string(),
  NomeEstacaoDestino: string(),
  Observacoes: nullish(string()),
});

const FertagusResponseSchema = looseObject({
  response: array(
    looseObject({
      NodesComboioTabelsPartidasChegadas: array(FertagusTrainSchema),
    }),
  ),
});

type FertagusTrainTiming = InferOutput<typeof FertagusTrainSchema>;

function parseFertagusDateTime(value: string): Date {
  const [datePart, timePart] = value.split(" ");
  const [day, month, year] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.split(":");
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
}

function parseFertagusDelay(delayText: null | string | undefined) {
  return {
    hours: Number.parseInt(delayText?.match(/(\d+) hora?/)?.[1] ?? "0"),
    minutes: Number.parseInt(delayText?.match(/(\d+) minutos?/)?.[1] ?? "0"),
  };
}

function addFertagusDelay(dateTime: Date, hours: number, minutes: number): Date {
  const delayedDateTime = new Date(dateTime);
  if (minutes) {
    delayedDateTime.setMinutes(delayedDateTime.getMinutes() + minutes);
  }
  if (hours) {
    delayedDateTime.setHours(delayedDateTime.getHours() + hours);
  }
  return delayedDateTime;
}

function getFertagusTrainTiming(train: FertagusTrainTiming) {
  const dateTime = parseFertagusDateTime(train.DataHoraPartidaChegada_ToOrderBy);
  const originalDateTime = dateTime.toISOString();
  const originalTime = originalDateTime.match(/T(\d+:\d+)/)?.[1];
  const delayText = train.Observacoes;
  const { hours: delayInHours, minutes: delayInMinutes } = parseFertagusDelay(delayText);
  const expectedDateTime = addFertagusDelay(dateTime, delayInHours, delayInMinutes).toISOString();
  const expectedTime = originalDateTime.match(/T(\d+:\d+)/)?.[1];
  const expectedTimeWithDelay = `${expectedTime}${delayInMinutes ? ` (${delayInMinutes})` : ""}`;

  return {
    delayText,
    expectedDateTime,
    expectedTime,
    expectedTimeWithDelay,
    originalDateTime,
    originalTime,
  };
}

async function sendDiscordHealthcheckPayload(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<void> {
  if (webhookUrl.length === 0) {
    throw new Error("Healthcheck Discord webhook URL is empty");
  }

  const response = await fetch(webhookUrl, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with ${response.status} ${response.statusText}`);
  }
}

function reportDiscordHealthcheckPayload(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<void> {
  return sendDiscordHealthcheckPayload(webhookUrl, payload).catch((error) => {
    console.error("Failed to send Discord healthcheck message", error);
  });
}

async function fetchRssHealthcheckUrl(
  url: string,
  env: CloudflareBindings,
  executionCtx: HonoExecutionContext,
): Promise<RssHealthcheckFetchResult> {
  const response = await app.fetch(new Request(url), env, executionCtx);
  const body = await response.text();

  return {
    body,
    ok: response.ok,
    statusCode: response.status,
  };
}

async function fetchHttpHealthcheckUrl(url: string): Promise<RssHealthcheckFetchResult> {
  const response = await fetch(url);
  const body = await response.text();

  return {
    body,
    ok: response.ok,
    statusCode: response.status,
  };
}

function fetchHealthcheckUrl(
  url: string,
  externalUrls: ReadonlyArray<string>,
  env: CloudflareBindings,
  executionCtx: HonoExecutionContext,
): Promise<RssHealthcheckFetchResult> {
  return externalUrls.includes(url)
    ? fetchHttpHealthcheckUrl(url)
    : fetchRssHealthcheckUrl(url, env, executionCtx);
}

function reportRssHealthcheck(
  summary: RssHealthcheckResponse,
  env: CloudflareBindings,
  executionCtx: HonoExecutionContext,
): void {
  const passed = summary.failures.length === 0;
  const payload = passed
    ? getDiscordHealthcheckPassPayload(summary)
    : getDiscordHealthcheckFailurePayload(summary);
  const webhookUrl = passed
    ? env.HEALTHCHECK_DISCORD_SUCCEEDED_WEBHOOK_URL
    : env.HEALTHCHECK_DISCORD_FAILED_WEBHOOK_URL;

  executionCtx.waitUntil(reportDiscordHealthcheckPayload(webhookUrl, payload));
}

async function runRssHealthcheckAndReport(
  origin: string,
  env: CloudflareBindings,
  executionCtx: HonoExecutionContext,
): Promise<RssHealthcheckResponse> {
  try {
    const externalUrls = [getHttpRelayHealthcheckUrl(env.HTTP_RELAY_URL)];
    const summary = await runRssHealthcheck(
      getRssHealthcheckPaths(app.routes),
      origin,
      (url) => fetchHealthcheckUrl(url, externalUrls, env, executionCtx),
      externalUrls,
    );

    reportRssHealthcheck(summary, env, executionCtx);

    return summary;
  } catch (error) {
    executionCtx.waitUntil(
      reportDiscordHealthcheckPayload(
        env.HEALTHCHECK_DISCORD_FAILED_WEBHOOK_URL,
        getDiscordHealthcheckErrorPayload("Internal Server Error"),
      ),
    );
    throw error;
  }
}

const app = new Hono<{ Bindings: CloudflareBindings }>();
addCoverflexEndpoints(app);
addXEndpoints(app);
addIcs2GcalEndpoint(app);
addScrapedRssEndpoints(app);

app.get("/rss.sendCinecartazEntriesByEmail", async (ctx) => {
  return ctx.json(await sendCinecartazEntriesByEmail(ctx.env));
});

app.get("/rss.sendCinemaxRtpPassatemposEntriesByEmail", async (ctx) => {
  return ctx.json(await sendCinemaxRtpPassatemposEntriesByEmail(ctx.env));
});

app.get("/ip.getTrainInformation/:trainId/:date", cors({ origin: "*" }), async (ctx) => {
  const trainId = ctx.req.param("trainId");
  const date = ctx.req.param("date");
  const response = await fetch(
    `https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios-ncombio/${trainId}/${date}`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      method: "GET",
    },
  );
  const json = await response.json();
  return ctx.json(json);
});

app.get("/ip.getStations/:name", cors({ origin: "*" }), async (ctx) => {
  const name = ctx.req.param("name");
  const response = await fetch(
    `https://www.infraestruturasdeportugal.pt/negocios-e-servicos/estacao-nome/${name}`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      method: "GET",
    },
  );
  const json = await response.json();
  return ctx.json(json);
});

app.get(
  "/ip.getTimetables/:stationId/:startDate/:endDate/:trainTypes",
  cors({ origin: "*" }),
  async (ctx) => {
    const stationId = ctx.req.param("stationId");
    const startDate = ctx.req.param("startDate");
    const endDate = ctx.req.param("endDate");
    const trainTypes = ctx.req.param("trainTypes");
    const response = await fetch(
      `https://www.infraestruturasdeportugal.pt/negocios-e-servicos/partidas-chegadas/${stationId}/${startDate}/${endDate}/${trainTypes}`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        },
        method: "GET",
      },
    );
    const json = await response.json();
    return ctx.json(json);
  },
);

app.get("/fertagus.nextTrainLeavingCorroios", async (ctx) => {
  const response = await fetch(
    "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/partidas-chegadas/9417137/%2000:00/%2023:59/URB%7CSUBUR",
    {
      body: null,
      headers: {
        accept: "application/json, text/plain, */*",
        Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      method: "GET",
    },
  );
  const json = parse(FertagusResponseSchema, await response.json());
  const train = json.response[1].NodesComboioTabelsPartidasChegadas.find(
    (train) => !train.ComboioPassou && train.NomeEstacaoDestino === "ROMA-AREEIRO",
  );

  if (!train) {
    ctx.header("Cache-Control", "public, max-age=60");
    return ctx.json({});
  }

  ctx.header("Cache-Control", "public, max-age=60");
  return ctx.json(getFertagusTrainTiming(train));
});

app.get(
  "/sentry.debug.throwError",
  async (ctx, next) => {
    const auth = basicAuth({
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
    });
    return auth(ctx, next);
  },
  (ctx) => {
    throw new Error(`😵‍💫 im an error on ${ctx.env.ENVIRONMENT}`);
  },
);

app.get(
  "/healthcheck",
  async (ctx, next) => {
    const auth = basicAuth({
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
    });
    return auth(ctx, next);
  },
  async (ctx) => {
    const summary = await runRssHealthcheckAndReport(
      new URL(ctx.req.url).origin,
      ctx.env,
      ctx.executionCtx,
    );

    ctx.status(summary.summary.failed === 0 ? 200 : 503);
    return ctx.json(summary);
  },
);

app.get(
  "/sentry.debug.log",
  async (ctx, next) => {
    const auth = basicAuth({
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
    });
    return auth(ctx, next);
  },
  (ctx) => {
    console.debug("Debug log!");
    console.log("Normal log!");
    console.error("Error log!");
    return ctx.text("Logged something!");
  },
);

app.get(
  "/sentry.debug.tracing",
  async (ctx, next) => {
    const auth = basicAuth({
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
    });
    return auth(ctx, next);
  },
  async (ctx) => {
    await fetch("https://goncalo.mendescabrita.com");

    return ctx.text("Fetched something!");
  },
);

app.get(
  "/",
  async (ctx, next) => {
    const auth = basicAuth({
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
    });
    return auth(ctx, next);
  },
  async (ctx) => {
    return ctx.html(`<html>
    <body>
      ${app.routes
        .map((route) => {
          return `<code>${route.method} <a href="${route.path}" target="_blank">${route.path}</a><br></code>`;
        })
        .filter((value, index, self) => self.indexOf(value) === index)
        .join("\n")}
    </body>
    </html>`);
  },
);

export default withSentry(
  (env: CloudflareBindings) => {
    const { id: versionId } = env.CF_VERSION_METADATA;
    return {
      dsn: env.SENTRY_DSN,
      enabled: env.ENVIRONMENT === "production",
      enableLogs: true,
      integrations: [consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
      release: versionId,
      sendDefaultPii: true,
      tracesSampleRate: 1,
    };
  },
  {
    fetch: app.fetch,
    async scheduled(controller, env, ctx) {
      switch (controller.cron) {
        case "* * * * *":
          await Promise.all([
            withMonitor(
              "rss.sendCinecartazEntriesByEmail",
              async () => {
                await sendCinecartazEntriesByEmail(env);
              },
              {
                checkinMargin: 2,
                schedule: {
                  type: "crontab",
                  value: "* * * * *",
                },
              },
            ),
            withMonitor(
              "rss.sendCinemaxRtpPassatemposEntriesByEmail",
              async () => {
                await sendCinemaxRtpPassatemposEntriesByEmail(env);
              },
              {
                checkinMargin: 2,
                schedule: {
                  type: "crontab",
                  value: "* * * * *",
                },
              },
            ),
            withMonitor(
              "mauser.checkSc1176StockAndNotify",
              async () => {
                await checkMauserSc1176StockAndNotify(env, new Date(controller.scheduledTime));
              },
              {
                checkinMargin: 2,
                schedule: {
                  type: "crontab",
                  value: "* * * * *",
                },
              },
            ),
          ]);
          break;
        case "*/15 * * * *":
          await withMonitor(
            "coverflex.sendAppleCatalogueByEmail",
            async () => {
              await sendAppleCatalogueByEmail(env);
            },
            {
              checkinMargin: 2,
              schedule: {
                type: "crontab",
                value: "*/15 * * * *",
              },
            },
          );
          break;
        case "0 1 * * *":
          await withMonitor(
            "rss.cacheAgendaLx",
            async () => {
              await cacheAgendaLx(env);
            },
            {
              checkinMargin: 10,
              schedule: {
                type: "crontab",
                value: "0 1 * * *",
              },
            },
          );
          break;
        case "0 12 * * *":
          await withMonitor(
            "rss.healthcheck",
            async () => {
              await runRssHealthcheckAndReport(rssHealthcheckOrigin, env, ctx);
            },
            {
              checkinMargin: 10,
              schedule: {
                type: "crontab",
                value: "0 12 * * *",
              },
            },
          );
          break;
      }
    },
  } satisfies ExportedHandler<CloudflareBindings>,
);
