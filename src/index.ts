import { Hono } from "hono";
import * as Sentry from "@sentry/cloudflare";
import { basicAuth } from "hono/basic-auth";
import { addCoverflexEndpoints } from "@coverflex";

const app = new Hono<{ Bindings: CloudflareBindings }>();
addCoverflexEndpoints(app);

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
      console.log({ controller });
      switch (controller.cron) {
        case "*/1 * * * *":
          await Sentry.withMonitor(
            "coverflex.sendAppleCatalogueByEmail",
            async () => {
              await fetch(
                `https://${env.PRIVATE_BASIC_AUTH_USERNAME}:${env.PRIVATE_BASIC_AUTH_PASSWORD}@run.gmcabrita.com/coverflex.sendAppleCatalogueByEmail`,
              );
            },
            {
              schedule: {
                type: "crontab",
                value: "*/1 * * * *",
              },
              checkinMargin: 2,
            },
          );
          break;
      }
    },
  } satisfies ExportedHandler<CloudflareBindings>,
);
