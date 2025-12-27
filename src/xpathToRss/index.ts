import { Hono } from "hono";
import { sendCinecartazEntriesByEmail } from "@rss/scrapers/cinecartaz";

export function addXpathToRssEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get("/rss.sendCinecartazEntriesByEmail", async (c) => {
    await sendCinecartazEntriesByEmail(c.env);
    return c.text("");
  });
}
