import type { ScraperContext } from "@rss/common";
import type { RSSData } from "@rss/types";
import {
  fetchRtpFinancialDocumentPage,
  parseRtpFinancialDocumentPage,
  type RtpFinancialDocumentPageConfig,
} from "./rtpFinancialDocuments";

const CONFIG: RtpFinancialDocumentPageConfig = {
  description: "Relatórios de serviço público publicados pela RTP.",
  pageUrl:
    "https://media.rtp.pt/empresa/inf-financeira/relatorio-de-servico-publico-relatorio-e-contas/",
  title: "RTP – Relatório de serviço público",
};

export async function parse(response: Response): Promise<RSSData> {
  return parseRtpFinancialDocumentPage(response, CONFIG);
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return fetchRtpFinancialDocumentPage(CONFIG, ctx);
}
