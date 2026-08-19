import { Hono, type ExecutionContext as HonoExecutionContext } from "hono";
import * as Sentry from "@sentry/cloudflare";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { addCoverflexEndpoints, sendAppleCatalogueByEmail } from "@coverflex";
import { sendCinecartazEntriesByEmail } from "@rss/scrapers/cinecartaz";
import { sendCinemaxRtpPassatemposEntriesByEmail } from "@rss/scrapers/cinemaxRtpPassatempos";
import { addXEndpoints } from "@x";
import { addIcs2GcalEndpoint } from "./ics2gcal";
import { checkMauserSc1176StockAndNotify } from "./mauser";
import { addScrapedRssEndpoints, cacheAgendaLx } from "@rss/scrapers";
import * as v from "valibot";
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
const FertagusResponseSchema = v.looseObject({
  response: v.array(
    v.looseObject({
      NodesComboioTabelsPartidasChegadas: v.array(
        v.looseObject({
          ComboioPassou: v.boolean(),
          NomeEstacaoDestino: v.string(),
          DataHoraPartidaChegada_ToOrderBy: v.string(),
          Observacoes: v.nullish(v.string()),
        }),
      ),
    }),
  ),
});

async function sendDiscordHealthcheckPayload(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<void> {
  if (webhookUrl.length === 0) {
    throw new Error("Healthcheck Discord webhook URL is empty");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
    statusCode: response.status,
    ok: response.ok,
    body,
  };
}

async function fetchHttpHealthcheckUrl(url: string): Promise<RssHealthcheckFetchResult> {
  const response = await fetch(url);
  const body = await response.text();

  return {
    statusCode: response.status,
    ok: response.ok,
    body,
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
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
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
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
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
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
          Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
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
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        Referer: "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/horarios",
      },
      body: null,
      method: "GET",
    },
  );
  const json = v.parse(FertagusResponseSchema, await response.json());
  const train = json.response[1].NodesComboioTabelsPartidasChegadas.find(
    (train) => !train.ComboioPassou && train.NomeEstacaoDestino === "ROMA-AREEIRO",
  );

  if (!train) {
    ctx.header("Cache-Control", "public, max-age=60");
    return ctx.json({});
  }

  const dateStr = train.DataHoraPartidaChegada_ToOrderBy;
  const [datePart, timePart] = dateStr.split(" ");
  const [day, month, year] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.split(":");

  const dateTime = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  const originalDateTime = dateTime.toISOString();
  const originalTime = originalDateTime.match(/T(\d+:\d+)/)?.[1];

  const delayText = train.Observacoes;
  const delayInMinutes = Number.parseInt(delayText?.match(/(\d+) minutos?/)?.[1] ?? "0");
  const delayInHours = Number.parseInt(delayText?.match(/(\d+) hora?/)?.[1] ?? "0");
  if (delayInMinutes) {
    dateTime.setMinutes(dateTime.getMinutes() + delayInMinutes);
  }
  if (delayInHours) dateTime.setHours(dateTime.getHours() + delayInHours);
  const expectedDateTime = dateTime.toISOString();
  const expectedTime = originalDateTime.match(/T(\d+:\d+)/)?.[1];
  const expectedTimeWithDelay = `${expectedTime}${delayInMinutes ? ` (${delayInMinutes})` : ""}`;

  ctx.header("Cache-Control", "public, max-age=60");
  return ctx.json({
    delayText,
    originalDateTime,
    expectedDateTime,
    originalTime,
    expectedTime,
    expectedTimeWithDelay,
  });
});

app.get(
  "/sentry.debug.throwError",
  async (ctx, next) => {
    const auth = basicAuth({
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
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
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
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
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
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
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
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
      username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
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

export default Sentry.withSentry(
  (env: CloudflareBindings) => {
    const { id: versionId } = env.CF_VERSION_METADATA;
    return {
      dsn: env.SENTRY_DSN,
      release: versionId,
      tracesSampleRate: 1,
      sendDefaultPii: true,
      integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
      enableLogs: true,
      enabled: env.ENVIRONMENT === "production",
    };
  },
  {
    fetch: app.fetch,
    async scheduled(controller, env, ctx) {
      switch (controller.cron) {
        case "* * * * *":
          await Promise.all([
            Sentry.withMonitor(
              "rss.sendCinecartazEntriesByEmail",
              async () => {
                await sendCinecartazEntriesByEmail(env);
              },
              {
                schedule: {
                  type: "crontab",
                  value: "* * * * *",
                },
                checkinMargin: 2,
              },
            ),
            Sentry.withMonitor(
              "rss.sendCinemaxRtpPassatemposEntriesByEmail",
              async () => {
                await sendCinemaxRtpPassatemposEntriesByEmail(env);
              },
              {
                schedule: {
                  type: "crontab",
                  value: "* * * * *",
                },
                checkinMargin: 2,
              },
            ),
            Sentry.withMonitor(
              "mauser.checkSc1176StockAndNotify",
              async () => {
                await checkMauserSc1176StockAndNotify(env, new Date(controller.scheduledTime));
              },
              {
                schedule: {
                  type: "crontab",
                  value: "* * * * *",
                },
                checkinMargin: 2,
              },
            ),
          ]);
          break;
        case "*/15 * * * *":
          await Sentry.withMonitor(
            "coverflex.sendAppleCatalogueByEmail",
            async () => {
              await sendAppleCatalogueByEmail(env);
            },
            {
              schedule: {
                type: "crontab",
                value: "*/15 * * * *",
              },
              checkinMargin: 2,
            },
          );
          break;
        case "0 1 * * *":
          await Sentry.withMonitor(
            "rss.cacheAgendaLx",
            async () => {
              await cacheAgendaLx(env);
            },
            {
              schedule: {
                type: "crontab",
                value: "0 1 * * *",
              },
              checkinMargin: 10,
            },
          );
          break;
        case "0 12 * * *":
          await Sentry.withMonitor(
            "rss.healthcheck",
            async () => {
              await runRssHealthcheckAndReport(rssHealthcheckOrigin, env, ctx);
            },
            {
              schedule: {
                type: "crontab",
                value: "0 12 * * *",
              },
              checkinMargin: 10,
            },
          );
          break;
      }
    },
  } satisfies ExportedHandler<CloudflareBindings>,
);
