import { Hono } from "hono";
import { Feed } from "feed";
import type { RSSData } from "@rss/types";
import { stripInvalidXmlChars, type ScraperContext } from "@rss/common";

import { get as adAgeNews } from "./scrapers/adAgeNews";
import { get as adsOfTheWorldBlog } from "./scrapers/adsOfTheWorldBlog";
import { cacheAgendaLx } from "./scrapers/agendaLx";
import { get as agendaLxPdf } from "./scrapers/agendaLxPdf";
import { get as antibotBlog } from "./scrapers/antibotBlog";
import { get as autoRegulacaoPublicitariaDeliberacoes } from "./scrapers/autoRegulacaoPublicitariaDeliberacoes";
import { get as azerpasBlog } from "./scrapers/azerpasBlog";

export { cacheAgendaLx } from "./scrapers/agendaLx";
import { get as anteEstreias } from "./scrapers/anteEstreias";
import { get as ccbEventos } from "./scrapers/ccbEventos";
import { get as cinecartaz } from "./scrapers/cinecartaz";
import { get as ccpjDestaques } from "./scrapers/ccpjDestaques";
import { get as cmJornalTvMedia } from "./scrapers/cmJornalTvMedia";
import { get as culturgestEventos } from "./scrapers/culturgestEventos";
import { get as dansvetlovArticles } from "./scrapers/dansvetlovArticles";
import { get as dentsuNewsReleases } from "./scrapers/dentsuNewsReleases";
import { get as discordQuests } from "./scrapers/discordQuests";
import { get as dnMedia } from "./scrapers/dnMedia";
import { get as cinemateca } from "./scrapers/cinemateca";
import { get as cinemaxRtpPassatempos } from "./scrapers/cinemaxRtpPassatempos";
import { get as epicFreeDesktopGames } from "./scrapers/epicFreeDesktopGames";
import {
  getAndroid as epicFreeAndroidGames,
  getiOS as epicFreeiOSGames,
} from "./scrapers/epicFreeMobileGames";
import { get as ercDeliberacoes } from "./scrapers/ercDeliberacoes";
import { get as ercNoticias } from "./scrapers/ercNoticias";
import { get as expressoMedia } from "./scrapers/expressoMedia";
import { get as filmspotEstreias } from "./scrapers/filmspotEstreias";
import { get as ftMedia } from "./scrapers/ftMedia";
import { get as fundoAmbiental } from "./scrapers/fundoAmbiental";
import { get as imagensDeMarca } from "./scrapers/imagensDeMarca";
import { get as impresaComunicados } from "./scrapers/impresaComunicados";
import { get as impresaInvestidores } from "./scrapers/impresaInvestidores";
import { get as informacaoLisboa } from "./scrapers/informacaoLisboa";
import { get as informacaoLisboaAgenda } from "./scrapers/informacaoLisboaAgenda";
import { get as jeremyEvansBlog } from "./scrapers/jeremyEvansBlog";
import { get as jnMedia } from "./scrapers/jnMedia";
import { get as jornalDeNegociosMedia } from "./scrapers/jornalDeNegociosMedia";
import { get as kernelShBlog } from "./scrapers/kernelShBlog";
import { get as kirShatrovBlog } from "./scrapers/kirShatrovBlog";
import { get as kitLangtonBlog } from "./scrapers/kitLangtonBlog";
import { get as lbbonlineInternational } from "./scrapers/lbbonlineInternational";
import { get as marktestPodScope } from "./scrapers/marktestPodScope";
import { get as mfeMediaForEuropeDocuments } from "./scrapers/mfeMediaForEuropeDocuments";
import { get as museuDoOrienteCinema } from "./scrapers/museuDoOrienteCinema";
import { get as nimas } from "./scrapers/nimas";
import { get as observadorMedia } from "./scrapers/observadorMedia";
import { get as peetBlog } from "./scrapers/peetBlog";
import { get as primeFreeGames } from "./scrapers/primeFreeGames";
import { get as publicoMedia } from "./scrapers/publicoMedia";
import { get as reutersMediaTelecom } from "./scrapers/reutersMediaTelecom";
import { get as rtpConselhoGeralIndependente } from "./scrapers/rtpConselhoGeralIndependente";
import { get as rtpInformacaoAnual } from "./scrapers/rtpInformacaoAnual";
import { get as rtpPlanoAtividadeOrcamento } from "./scrapers/rtpPlanoAtividadeOrcamento";
import { get as rtpRelatorioServicoPublico } from "./scrapers/rtpRelatorioServicoPublico";
import { get as sqliteNews } from "./scrapers/sqliteNews";
import { get as theDrumLatest } from "./scrapers/theDrumLatest";
import { get as bbcMediaCentreLatestNews } from "./scrapers/bbcMediaCentreLatestNews";
import { get as berserk } from "./scrapers/berserk";
import { get as brokenBrowserBlog } from "./scrapers/brokenBrowserBlog";
import { get as uciPromocoes } from "./scrapers/uciPromocoes";
import { get as viralAgendaAlmada } from "./scrapers/viralAgendaAlmada";
import { get as waltDisneyPressReleases } from "./scrapers/waltDisneyPressReleases";
import { get as wsjBusinessMedia } from "./scrapers/wsjBusinessMedia";

type Scraper = (ctx: ScraperContext) => Promise<RSSData>;

const scrapers = {
  adAgeNews,
  adsOfTheWorldBlog,
  agendaLxPdf,
  anteEstreias,
  antibotBlog,
  autoRegulacaoPublicitariaDeliberacoes,
  azerpasBlog,
  bbcMediaCentreLatestNews,
  berserk,
  brokenBrowserBlog,
  ccbEventos,
  ccpjDestaques,
  cinecartaz,
  cinemateca,
  cinemaxRtpPassatempos,
  cmJornalTvMedia,
  culturgestEventos,
  dansvetlovArticles,
  dentsuNewsReleases,
  discordQuests,
  dnMedia,
  epicFreeDesktopGames,
  ercDeliberacoes,
  ercNoticias,
  expressoMedia,
  filmspotEstreias,
  ftMedia,
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
  uciPromocoes,
  viralAgendaAlmada,
  waltDisneyPressReleases,
  wsjBusinessMedia,
} satisfies Record<string, Scraper>;

// Special handlers for mobile games (different function names)
const mobileGameScrapers = {
  epicFreeAndroidGames,
  epicFreeiOSGames,
};

function createRssHandler(getFn: (ctx: ScraperContext) => Promise<RSSData>) {
  return async (ctx: ScraperContext) => {
    const { description, entries, id, language, link, title } = await getFn(ctx);

    const now = new Date();
    const feed = new Feed({
      copyright: "",
      description,
      id,
      language,
      link,
      title,
      updated: now,
    });

    entries.forEach((entry) => {
      feed.addItem({
        content:
          `<p>${entry.text}</p><a href="${entry.link}">${entry.link}</a>${entry.imageURL ? `<p><img src="${entry.imageURL}" alt="${entry.title}" /></p>` : ""}`.trim(),
        date: entry.datetime || now,
        id: entry.id,
        link: entry.link,
        title: entry.title,
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
    app.get(`/rss.${name}`, createRssHandler(scraper));
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
    const rss2 = await cacheAgendaLx(ctx.env);

    ctx.header("Content-Type", "application/rss+xml");
    ctx.header("Cache-Control", "public, max-age=600");
    return ctx.text(rss2);
  });
}
