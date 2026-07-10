import { describe, expect, it } from "vitest";
import html from "./__fixtures__/rtp-conselho-geral-independente.html";
import { parse } from "./rtpConselhoGeralIndependente";

function createResponse(value: string) {
  return new Response(value, {
    headers: { "Content-Type": "text/html" },
  });
}

describe("RTP Conselho Geral Independente scraper", () => {
  it("parses only links under EM DESTAQUE", async () => {
    const result = await parse(createResponse(html));

    expect(result.id).toBe(
      "https://media.rtp.pt/empresa/orgaos-sociais/conselho-geral-independente/",
    );
    expect(result.title).toBe("RTP – Conselho Geral Independente");
    expect(result.language).toBe("pt");
    expect(result.entries).toHaveLength(3);
    expect(result.entries).toEqual([
      {
        id: "https://cdn-images.rtp.pt/mcm/pdf/4c6/4c6dc3a7e6b7ae6911c91ddea093f0761.pdf",
        link: "https://cdn-images.rtp.pt/mcm/pdf/4c6/4c6dc3a7e6b7ae6911c91ddea093f0761.pdf",
        title: "Recrutamento do Órgão de Gestão da RTP para o Triénio 2027-2029",
        text: "Recrutamento do Órgão de Gestão da RTP para o Triénio 2027-2029",
      },
      {
        id: "https://cdn-images.rtp.pt/mcm/pdf/6fb/6fb3d01b6fec796df3596fbe9690bd241.pdf",
        link: "https://cdn-images.rtp.pt/mcm/pdf/6fb/6fb3d01b6fec796df3596fbe9690bd241.pdf",
        title: "Comunicado de 9 de julho de 2026",
        text: "Comunicado de 9 de julho de 2026",
      },
      {
        id: "https://media.rtp.pt/docs/linhas-orientacao.pdf",
        link: "https://media.rtp.pt/docs/linhas-orientacao.pdf",
        title: "Linhas de Orientação Estratégica 2027-2029",
        text: "Linhas de Orientação Estratégica 2027-2029",
      },
    ]);
  });
});
