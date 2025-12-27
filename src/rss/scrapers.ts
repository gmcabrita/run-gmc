import { Hono } from "hono";
import { Feed } from "feed";
import type { RSSData } from "@rss/types";

import * as waltDisneyPressReleases from "./scrapers/waltDisneyPressReleases";

type ScraperModule = {
  get: () => Promise<RSSData>;
};

const scrapers: Record<string, ScraperModule> = {
  waltDisneyPressReleases,
};

export function addScrapedRssEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  for (const [name, scraper] of Object.entries(scrapers)) {
    app.get(`/rss.${name}`, async (c) => {
      const { title, description, id, link, language, entries } = await scraper.get();

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
}
