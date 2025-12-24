import { Hono } from "hono";
import * as Sentry from "@sentry/cloudflare";
import { basicAuth } from "hono/basic-auth";
import { addCoverflexEndpoints, sendAppleCatalogueByEmail } from "@coverflex";
import { addXpathToRssEndpoints, sendCinecartazEntriesByEmail } from "@xpathToRss";
import { addXToRssEndpoints } from "@xToRss";
import { addFetchToRssEndpoints } from "@fetchToRss";

const app = new Hono<{ Bindings: CloudflareBindings }>();
addCoverflexEndpoints(app);
addXpathToRssEndpoints(app);
addXToRssEndpoints(app);
addFetchToRssEndpoints(app);

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
    return c.text(
      app.routes
        .map((route) => {
          return `${route.method} ${route.path}`;
        })
        .filter((value, index, self) => self.indexOf(value) === index)
        .join("\n"),
    );
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
