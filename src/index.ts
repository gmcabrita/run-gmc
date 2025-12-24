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

export default Sentry.withSentry((env: CloudflareBindings) => {
  const { id: versionId } = env.CF_VERSION_METADATA;
  return {
    dsn: "https://fc27b2ddd92ca2ed76a89cb8a5124dbb@o4510586740342784.ingest.us.sentry.io/4510586741981184",
    release: versionId,
    sendDefaultPii: true,
  };
}, app);
