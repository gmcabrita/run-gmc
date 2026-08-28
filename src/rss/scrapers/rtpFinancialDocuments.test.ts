import { describe, expect, it } from "vitest";
import { parse as parseInformacaoAnual } from "./rtpInformacaoAnual";
import { parse as parsePlanoAtividadeOrcamento } from "./rtpPlanoAtividadeOrcamento";
import { parse as parseRelatorioServicoPublico } from "./rtpRelatorioServicoPublico";
import informacaoAnualHtml from "./__fixtures__/rtp-informacao-anual.html";
import planoAtividadeOrcamentoHtml from "./__fixtures__/rtp-plano-atividade-orcamento.html";
import relatorioServicoPublicoHtml from "./__fixtures__/rtp-relatorio-servico-publico.html";

function createResponse(html: string) {
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("RTP financial document scrapers", () => {
  it("parses plano de atividade e orçamento documents", async () => {
    const result = await parsePlanoAtividadeOrcamento(createResponse(planoAtividadeOrcamentoHtml));

    expect(result.id).toBe(
      "https://media.rtp.pt/empresa/inf-financeira/plano-de-atividade-e-orcamento-relatorio-e-contas/",
    );
    expect(result.title).toBe("RTP – Plano de atividade e orçamento");
    expect(result.language).toBe("pt");
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({
      id: "https://cdn-images.rtp.pt/mcm/pdf/4d6/4d68af2f2bd1dffa6584548964f95ca61.pdf",
      link: "https://cdn-images.rtp.pt/mcm/pdf/4d6/4d68af2f2bd1dffa6584548964f95ca61.pdf",
      text: "Plano de Atividades 2025",
      title: "Plano de Atividades 2025",
    });
    expect(result.entries.map((entry) => entry.title)).not.toContain("Código de Ética");
    expect(result.entries.map((entry) => entry.title)).not.toContain("Hidden");
  });

  it("parses relatório de serviço público documents", async () => {
    const result = await parseRelatorioServicoPublico(createResponse(relatorioServicoPublicoHtml));

    expect(result.id).toBe(
      "https://media.rtp.pt/empresa/inf-financeira/relatorio-de-servico-publico-relatorio-e-contas/",
    );
    expect(result.title).toBe("RTP – Relatório de serviço público");
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Relatório de Serviço Público 2024",
      "Relatório de Serviço Público 2023",
      "Relatório de Serviço Público 2009",
    ]);
  });

  it("parses relatório e contas documents", async () => {
    const result = await parseInformacaoAnual(createResponse(informacaoAnualHtml));

    expect(result.id).toBe("https://media.rtp.pt/empresa/inf-financeira/informacao-anual/");
    expect(result.title).toBe("RTP – Relatório e Contas");
    expect(result.entries).toHaveLength(4);
    expect(result.entries.map((entry) => entry.title)).toEqual([
      "Relatório e Contas 2025",
      "Relatório e Contas 2024",
      "Relatório e Parecer do Conselho Fiscal sobre os documentos de prestação de contas de 2021",
      "Relatório e Contas",
    ]);
    expect(result.entries[3].link).toBe("https://media.rtp.pt/docs/pdf/2006%20relatorio%20e%20contas.pdf");
  });
});
