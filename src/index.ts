import { Hono } from "hono";
import { addCoverflexEndpoints } from "@coverflex";

const app = new Hono<{ Bindings: CloudflareBindings }>();
addCoverflexEndpoints(app);

export default app;
