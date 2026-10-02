import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    compatibilityDate: "2025-12-23",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["run.gmcabrita.com"],
    entrypoint: "src/index.ts",
    // Set values for `bindings.secret()` entries with `cf workers secrets update` in
    // production and in `.dev.vars` for local development.
    env: {
      CF_VERSION_METADATA: bindings.versionMetadata(),
      COVERFLEX_EMAIL: bindings.text("goncalo@mendescabrita.com"),
      COVERFLEX_PASSWORD: bindings.secret(),
      COVERFLEX_USER_AGENT_TOKEN: bindings.secret(),
      DISCORD_AUTHORIZATION_TOKEN: bindings.secret(),
      EMAIL: bindings.sendEmail({
        dev: {
          remote: true,
        },
      }),
      ENVIRONMENT: bindings.text("production"),
      HEALTHCHECK_DISCORD_FAILED_WEBHOOK_URL: bindings.secret(),
      HEALTHCHECK_DISCORD_SUCCEEDED_WEBHOOK_URL: bindings.secret(),
      HTTP_RELAY_TOKEN: bindings.secret(),
      HTTP_RELAY_URL: bindings.secret(),
      POKE_API_KEY: bindings.secret(),
      PRIVATE_BASIC_AUTH_PASSWORD: bindings.secret(),
      PRIVATE_BASIC_AUTH_USERNAME: bindings.secret(),
      RUN_GMC_EMAIL_IDEMPOTENCY_KV: bindings.kv({
        id: "67a6fccf562346b386524702eca9f08a",
      }),
      RUN_GMC_GENERIC_CACHE_KV: bindings.kv({
        id: "0fcd98a6cb4e4c649546900e489714a3",
      }),
      RUN_GMC_X_CACHE_KV: bindings.kv({
        id: "729bee60cd2e4a8381aa4f0a96954a0f",
      }),
      SENTRY_DSN: bindings.secret(),
      X_BEARER: bindings.secret(),
      X_COOKIE: bindings.secret(),
      X1_COOKIE: bindings.secret(),
      X2_COOKIE: bindings.secret(),
      X3_COOKIE: bindings.secret(),
    },
    name: "run-gmc",
    observability: {
      logs: {
        enabled: true,
        headSamplingRate: 1,
        invocationLogs: true,
        persist: true,
      },
      traces: {
        enabled: true,
        persist: true,
      },
    },
    previewUrls: true,
    triggers: [
      triggers.scheduled({
        schedule: "* * * * *",
      }),
      triggers.scheduled({
        schedule: "*/5 * * * *",
      }),
      triggers.scheduled({
        schedule: "*/15 * * * *",
      }),
      triggers.scheduled({
        schedule: "0 1 * * *",
      }),
      triggers.scheduled({
        schedule: "0 12 * * *",
      }),
    ],
  },
});
