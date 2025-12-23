import { Hono } from "hono";
import * as Sentry from "@sentry/cloudflare";
import { addCoverflexEndpoints } from "@coverflex";

const app = new Hono<{ Bindings: CloudflareBindings }>();
addCoverflexEndpoints(app);

app.get("/debug.throwError", (c) => {
  throw new Error(`😵‍💫 im an error on ${c.env.ENVIRONMENT}`);
});

export default Sentry.withSentry((env: CloudflareBindings) => {
  const { id: versionId } = env.CF_VERSION_METADATA;
  return {
    dsn: "https://fc27b2ddd92ca2ed76a89cb8a5124dbb@o4510586740342784.ingest.us.sentry.io/4510586741981184",
    release: versionId,
    sendDefaultPii: true,
  };
}, app);
