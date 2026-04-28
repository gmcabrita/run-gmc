import type { ScraperContext } from "@rss/common";
import type { RSSData } from "@rss/types";
import {
  fetchRtpFinancialDocumentPage,
  parseRtpFinancialDocumentPage,
  type RtpFinancialDocumentPageConfig,
} from "./rtpFinancialDocuments";

const CONFIG: RtpFinancialDocumentPageConfig = {
  pageUrl: "https://media.rtp.pt/empresa/inf-financeira/informacao-anual/",
  title: "RTP – Relatório e Contas",
  description: "Relatórios e contas publicados pela RTP.",
};

export async function parse(response: Response): Promise<RSSData> {
  return parseRtpFinancialDocumentPage(response, CONFIG);
}

export async function get(ctx: ScraperContext): Promise<RSSData> {
  return fetchRtpFinancialDocumentPage(CONFIG, ctx);
}
