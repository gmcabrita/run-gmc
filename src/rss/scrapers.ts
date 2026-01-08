import type { Context } from "hono";
import { Hono } from "hono";
import { Feed } from "feed";
import type { RSSData } from "@rss/types";
import type { ScraperContext } from "@rss/common";

import * as adsOfTheWorldBlog from "./scrapers/adsOfTheWorldBlog";
import * as agendaLx from "./scrapers/agendaLx";
import * as agendaLxPdf from "./scrapers/agendaLxPdf";

export { cacheAgendaLx } from "./scrapers/agendaLx";
import * as anteEstreias from "./scrapers/anteEstreias";
import * as cinecartaz from "./scrapers/cinecartaz";
import * as discordQuests from "./scrapers/discordQuests";
import * as cinemateca from "./scrapers/cinemateca";
import * as epicFreeDesktopGames from "./scrapers/epicFreeDesktopGames";
import * as epicFreeMobileGames from "./scrapers/epicFreeMobileGames";
import * as ercDeliberacoes from "./scrapers/ercDeliberacoes";
import * as ercNoticias from "./scrapers/ercNoticias";
import * as filmspotEstreias from "./scrapers/filmspotEstreias";
import * as fundoAmbiental from "./scrapers/fundoAmbiental";
import * as imagensDeMarca from "./scrapers/imagensDeMarca";
import * as impresaComunicados from "./scrapers/impresaComunicados";
import * as impresaInvestidores from "./scrapers/impresaInvestidores";
import * as informacaoLisboa from "./scrapers/informacaoLisboa";
import * as informacaoLisboaAgenda from "./scrapers/informacaoLisboaAgenda";
import * as jeremyEvansBlog from "./scrapers/jeremyEvansBlog";
import * as kirShatrovBlog from "./scrapers/kirShatrovBlog";
import * as kitLangtonBlog from "./scrapers/kitLangtonBlog";
import * as lbbonlineInternational from "./scrapers/lbbonlineInternational";
import * as marktestPodScope from "./scrapers/marktestPodScope";
import * as museuDoOrienteCinema from "./scrapers/museuDoOrienteCinema";
import * as nimas from "./scrapers/nimas";
import * as primeFreeGames from "./scrapers/primeFreeGames";
import * as scyllaDbMasterclasses from "./scrapers/scyllaDbMasterclasses";
import * as uciPromocoes from "./scrapers/uciPromocoes";
import * as waltDisneyPressReleases from "./scrapers/waltDisneyPressReleases";
import * as walzrBlog from "./scrapers/walzrBlog";

type ScraperModule = {
  get: (ctx: ScraperContext) => Promise<RSSData>;
};

const scrapers: Record<string, ScraperModule> = {
  adsOfTheWorldBlog,
  agendaLxPdf,
  anteEstreias,
  cinecartaz,
  cinemateca,
  discordQuests,
  epicFreeDesktopGames,
  ercDeliberacoes,
  ercNoticias,
  filmspotEstreias,
  fundoAmbiental,
  imagensDeMarca,
  impresaComunicados,
  impresaInvestidores,
  informacaoLisboa,
  informacaoLisboaAgenda,
  jeremyEvansBlog,
  kirShatrovBlog,
  kitLangtonBlog,
  lbbonlineInternational,
  marktestPodScope,
  museuDoOrienteCinema,
  nimas,
  primeFreeGames,
  scyllaDbMasterclasses,
  uciPromocoes,
  waltDisneyPressReleases,
  walzrBlog,
};

// Special handlers for mobile games (different function names)
const mobileGameScrapers = {
  epicFreeiOSGames: epicFreeMobileGames.getiOS,
  epicFreeAndroidGames: epicFreeMobileGames.getAndroid,
};

function createRssHandler(getFn: (ctx: ScraperContext) => Promise<RSSData>) {
  return async (ctx: ScraperContext) => {
    const { title, description, id, link, language, entries } = await getFn(ctx);

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

    ctx.header("Content-Type", "application/rss+xml");
    ctx.header("Cache-Control", "public, max-age=600");
    return ctx.text(feed.rss2());
  };
}

export function addScrapedRssEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  // Standard scrapers
  for (const [name, scraper] of Object.entries(scrapers)) {
    app.get(`/rss.${name}`, createRssHandler(scraper.get));
  }

  // Mobile game scrapers (different function names)
  for (const [name, getFn] of Object.entries(mobileGameScrapers)) {
    app.get(`/rss.${name}`, createRssHandler(getFn));
  }

  // AgendaLx (served from KV cache)
  app.get("/rss.agendaLx", async (ctx) => {
    const rss2 = (await ctx.env.RUN_GMC_GENERIC_CACHE_KV.get("agenda-lx-eventos")) || "";

    if (rss2) {
      ctx.header("Content-Type", "application/rss+xml");
      ctx.header("Cache-Control", "public, max-age=600");
    }
    return ctx.text(rss2);
  });

  // AgendaLx cache refresh endpoint
  app.get("/rss.cacheAgendaLx", async (ctx) => {
    const rss2 = await agendaLx.cacheAgendaLx(ctx.env);

    ctx.header("Content-Type", "application/rss+xml");
    ctx.header("Cache-Control", "public, max-age=600");
    return ctx.text(rss2);
  });
}
