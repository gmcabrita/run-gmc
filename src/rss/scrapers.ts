import type { Context } from "hono";
import { Hono } from "hono";
import { Feed } from "feed";
import type { RSSData } from "@rss/types";
import { stripInvalidXmlChars, type ScraperContext } from "@rss/common";

import * as adAgeNews from "./scrapers/adAgeNews";
import * as adsOfTheWorldBlog from "./scrapers/adsOfTheWorldBlog";
import * as agendaLx from "./scrapers/agendaLx";
import * as agendaLxPdf from "./scrapers/agendaLxPdf";
import * as autoRegulacaoPublicitariaDeliberacoes from "./scrapers/autoRegulacaoPublicitariaDeliberacoes";
import * as azerpasBlog from "./scrapers/azerpasBlog";

export { cacheAgendaLx } from "./scrapers/agendaLx";
import * as anteEstreias from "./scrapers/anteEstreias";
import * as ccbEventos from "./scrapers/ccbEventos";
import * as cinecartaz from "./scrapers/cinecartaz";
import * as ccpjDestaques from "./scrapers/ccpjDestaques";
import * as cmJornalTvMedia from "./scrapers/cmJornalTvMedia";
import * as culturgestEventos from "./scrapers/culturgestEventos";
import * as dansvetlovArticles from "./scrapers/dansvetlovArticles";
import * as dentsuNewsReleases from "./scrapers/dentsuNewsReleases";
import * as discordQuests from "./scrapers/discordQuests";
import * as cinemateca from "./scrapers/cinemateca";
import * as cinemaxRtpPassatempos from "./scrapers/cinemaxRtpPassatempos";
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
import * as jnMedia from "./scrapers/jnMedia";
import * as jornalDeNegociosMedia from "./scrapers/jornalDeNegociosMedia";
import * as kernelShBlog from "./scrapers/kernelShBlog";
import * as kirShatrovBlog from "./scrapers/kirShatrovBlog";
import * as kitLangtonBlog from "./scrapers/kitLangtonBlog";
import * as lbbonlineInternational from "./scrapers/lbbonlineInternational";
import * as marktestPodScope from "./scrapers/marktestPodScope";
import * as mfeMediaForEuropeDocuments from "./scrapers/mfeMediaForEuropeDocuments";
import * as museuDoOrienteCinema from "./scrapers/museuDoOrienteCinema";
import * as nimas from "./scrapers/nimas";
import * as observadorMedia from "./scrapers/observadorMedia";
import * as peetBlog from "./scrapers/peetBlog";
import * as primeFreeGames from "./scrapers/primeFreeGames";
import * as publicoMedia from "./scrapers/publicoMedia";
import * as reutersMediaTelecom from "./scrapers/reutersMediaTelecom";
import * as rtpConselhoGeralIndependente from "./scrapers/rtpConselhoGeralIndependente";
import * as rtpInformacaoAnual from "./scrapers/rtpInformacaoAnual";
import * as rtpPlanoAtividadeOrcamento from "./scrapers/rtpPlanoAtividadeOrcamento";
import * as rtpRelatorioServicoPublico from "./scrapers/rtpRelatorioServicoPublico";
import * as sqliteNews from "./scrapers/sqliteNews";
import * as theDrumLatest from "./scrapers/theDrumLatest";
import * as bbcMediaCentreLatestNews from "./scrapers/bbcMediaCentreLatestNews";
import * as berserk from "./scrapers/berserk";
import * as brokenBrowserBlog from "./scrapers/brokenBrowserBlog";
import * as uciPromocoes from "./scrapers/uciPromocoes";
import * as viralAgendaAlmada from "./scrapers/viralAgendaAlmada";
import * as waltDisneyPressReleases from "./scrapers/waltDisneyPressReleases";

type ScraperModule = {
  get: (ctx: ScraperContext) => Promise<RSSData>;
};

const scrapers: Record<string, ScraperModule> = {
  adAgeNews,
  adsOfTheWorldBlog,
  agendaLxPdf,
  autoRegulacaoPublicitariaDeliberacoes,
  anteEstreias,
  azerpasBlog,
  bbcMediaCentreLatestNews,
  berserk,
  ccbEventos,
  cinecartaz,
  cinemateca,
  cinemaxRtpPassatempos,
  ccpjDestaques,
  cmJornalTvMedia,
  culturgestEventos,
  dansvetlovArticles,
  dentsuNewsReleases,
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
  jnMedia,
  jornalDeNegociosMedia,
  kernelShBlog,
  kirShatrovBlog,
  kitLangtonBlog,
  lbbonlineInternational,
  marktestPodScope,
  mfeMediaForEuropeDocuments,
  museuDoOrienteCinema,
  nimas,
  observadorMedia,
  peetBlog,
  primeFreeGames,
  publicoMedia,
  reutersMediaTelecom,
  rtpConselhoGeralIndependente,
  rtpInformacaoAnual,
  rtpPlanoAtividadeOrcamento,
  rtpRelatorioServicoPublico,
  sqliteNews,
  theDrumLatest,
  brokenBrowserBlog,
  uciPromocoes,
  viralAgendaAlmada,
  waltDisneyPressReleases,
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

    const rss2 = stripInvalidXmlChars(feed.rss2());

    ctx.header("Content-Type", "application/rss+xml");
    ctx.header("Cache-Control", "public, max-age=600");
    return ctx.text(rss2);
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
    const rss2 = stripInvalidXmlChars(
      (await ctx.env.RUN_GMC_GENERIC_CACHE_KV.get("agenda-lx-eventos")) || "",
    );

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
