import type { ScraperContext } from "@rss/common";
import type { RSSData } from "@rss/types";
import {
  fetchRtpFinancialDocumentPage,
  parseRtpFinancialDocumentPage,
  type RtpFinancialDocumentPageConfig,
} from "./rtpFinancialDocuments";

const CONFIG: RtpFinancialDocumentPageConfig = {
  description: "Documentos de plano de atividade e orçamento publicados pela RTP.",
  pageUrl:
    "https://media.rtp.pt/empresa/inf-financeira/plano-de-atividade-e-orcamento-relatorio-e-contas/",
  title: "RTP – Plano de atividade e orçamento",
};

export async function parse(response: Response): Promise<RSSData> {
  return parseRtpFinancialDocumentPage(response, CONFIG);
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return fetchRtpFinancialDocumentPage(CONFIG, ctx);
}
