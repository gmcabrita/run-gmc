import { Hono } from "hono";
import * as Sentry from "@sentry/cloudflare";
import { basicAuth } from "hono/basic-auth";
import { addCoverflexEndpoints, sendAppleCatalogueByEmail } from "@coverflex";
import { addXpathToRssEndpoints } from "@xpathToRss";
import { sendCinecartazEntriesByEmail } from "@rss/scrapers/cinecartaz";
import { addXToRssEndpoints } from "@xToRss";
import { addFetchToRssEndpoints, cacheAgendaLx } from "@fetchToRss";
import { addScrapedRssEndpoints } from "@rss/scrapers";
import type { FertagusResponse } from "@types";

const app = new Hono<{ Bindings: CloudflareBindings }>();
addCoverflexEndpoints(app);
addXpathToRssEndpoints(app);
addXToRssEndpoints(app);
addFetchToRssEndpoints(app);
addScrapedRssEndpoints(app);

app.get("/fertagus.nextTrainLeavingCorroios", async (c) => {
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
  const json = (await response.json()) as FertagusResponse;
  const train = json.response[1].NodesComboioTabelsPartidasChegadas.find(
    (train) => !train.ComboioPassou && train.NomeEstacaoDestino === "ROMA-AREEIRO",
  );

  if (!train) {
    c.header("Cache-Control", "public, max-age=60");
    return c.json({});
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

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
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
  async (c, next) => {
    const auth = basicAuth({
      username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
    });
    return auth(c, next);
  },
  (c) => {
    throw new Error(`😵‍💫 im an error on ${c.env.ENVIRONMENT}`);
  },
);

app.get(
  "/sentry.debug.log",
  async (c, next) => {
    const auth = basicAuth({
      username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
    });
    return auth(c, next);
  },
  (c) => {
    console.debug("Debug log!");
    console.log("Normal log!");
    console.error("Error log!");
    return c.text("Logged something!");
  },
);

app.get(
  "/sentry.debug.tracing",
  async (c, next) => {
    const auth = basicAuth({
      username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
    });
    return auth(c, next);
  },
  async (c) => {
    await fetch("https://goncalo.mendescabrita.com");

    return c.text("Fetched something!");
  },
);

app.get(
  "/routes",
  async (c, next) => {
    const auth = basicAuth({
      username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
      password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
    });
    return auth(c, next);
  },
  async (c) => {
    return c.html(`<html>
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
      dsn: "https://fc27b2ddd92ca2ed76a89cb8a5124dbb@o4510586740342784.ingest.us.sentry.io/4510586741981184",
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
        case "*/10 * * * *":
          await Sentry.withMonitor(
            "coverflex.sendCinecartazEntriesByEmail",
            async () => {
              await sendCinecartazEntriesByEmail(env);
            },
            {
              schedule: {
                type: "crontab",
                value: "*/10 * * * *",
              },
              checkinMargin: 2,
            },
          );
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
      }
    },
  } satisfies ExportedHandler<CloudflareBindings>,
);
