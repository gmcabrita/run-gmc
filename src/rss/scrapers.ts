import { Hono } from "hono";
import { Feed } from "feed";
import type { RSSData } from "@rss/types";

import * as waltDisneyPressReleases from "./scrapers/waltDisneyPressReleases";
import * as ercNoticias from "./scrapers/ercNoticias";
import * as ercDeliberacoes from "./scrapers/ercDeliberacoes";
import * as cinecartaz from "./scrapers/cinecartaz";
import * as impresaInvestidores from "./scrapers/impresaInvestidores";
import * as adsOfTheWorldBlog from "./scrapers/adsOfTheWorldBlog";
import * as kitLangtonBlog from "./scrapers/kitLangtonBlog";
import * as walzrBlog from "./scrapers/walzrBlog";
import * as jeremyEvansBlog from "./scrapers/jeremyEvansBlog";
import * as kirShatrovBlog from "./scrapers/kirShatrovBlog";

type ScraperModule = {
  get: () => Promise<RSSData>;
};

const scrapers: Record<string, ScraperModule> = {
  adsOfTheWorldBlog,
  cinecartaz,
  ercDeliberacoes,
  ercNoticias,
  impresaInvestidores,
  jeremyEvansBlog,
  kirShatrovBlog,
  kitLangtonBlog,
  waltDisneyPressReleases,
  walzrBlog,
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
