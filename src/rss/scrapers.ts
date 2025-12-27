import { Hono } from "hono";
import { Feed } from "feed";
import { get as getDisney } from "./scrapers/waltDisneyPressReleases";

export function addScrapedRssEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get("/rss.waltDisneyPressReleases", async (c) => {
    const { title, description, id, link, language, entries } = await getDisney();

    const now = new Date();
    const feed = new Feed({
      title,
      description,
      id,
      link,
      language,
      copyright: "",
      updated: now,
    });

    entries.forEach((entry) => {
      feed.addItem({
        id: entry.id,
        title: entry.title,
        link: entry.link,
        content:
          `<p>${entry.text}</p><a href="${entry.link}">${entry.link}</a>${entry.imageURL ? `<p><img src="${entry.imageURL}" alt="${entry.title}" /></p>` : ""}`.trim(),
        date: entry.datetime || now,
      });
    });

    c.header("Content-Type", "application/rss+xml");
    c.header("Cache-Control", "public, max-age=600");
    return c.text(feed.rss2());
  });
}
