import { describe, expect, it } from "vitest";
import { parse } from "./cinemaxRtpPassatempos";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Passatempos Archive - RTP Cinemax</title>
    <link>https://cinemax.rtp.pt/passatempos/</link>
    <description>Um site português com um olhar sobre a actualidade do cinema.</description>
    <language>pt-PT</language>
    <item>
      <title>Antestreia: &#8220;O Dia da Revelação&#8221;</title>
      <link>https://cinemax.rtp.pt/passatempos/antestreia-o-dia-da-revelacao/</link>
      <pubDate>Mon, 01 Jun 2026 11:27:06 +0000</pubDate>
      <guid isPermaLink="false">https://cinemax.rtp.pt/?post_type=passatempos&#038;p=11778</guid>
      <description><![CDATA[<p>SINOPSE</p><p>Como participar.</p>]]></description>
    </item>
    <item>
      <title>[Terminado] Antestreia: &#8220;Mais Forte Que Eu&#8221;</title>
      <link>https://cinemax.rtp.pt/passatempos/antestreia-mais-forte-que-eu/</link>
      <pubDate>Tue, 05 May 2026 12:27:15 +0000</pubDate>
      <guid isPermaLink="false">https://cinemax.rtp.pt/?post_type=passatempos&#038;p=11533</guid>
      <description><![CDATA[<p>Terminado.</p>]]></description>
    </item>
  </channel>
</rss>`;

describe("cinemax RTP passatempos scraper", () => {
  it("parses passatempos from feed", async () => {
    const response = new Response(xml, {
      headers: { "Content-Type": "application/rss+xml" },
    });

    const result = await parse(response);

    expect(result.id).toBe("https://cinemax.rtp.pt/passatempos/feed/");
    expect(result.link).toBe("https://cinemax.rtp.pt/passatempos/");
    expect(result.title).toBe("Passatempos Archive - RTP Cinemax");
    expect(result.language).toBe("pt-PT");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      id: "https://cinemax.rtp.pt/?post_type=passatempos&p=11778",
      link: "https://cinemax.rtp.pt/passatempos/antestreia-o-dia-da-revelacao/",
      title: "Antestreia: “O Dia da Revelação”",
      text: "SINOPSE Como participar.",
    });
    expect(result.entries[1]?.title).toBe("[Terminado] Antestreia: “Mais Forte Que Eu”");
  });

  it("keeps finished passatempos when all entries are finished", async () => {
    const response = new Response(
      xml.replace(
        "<title>Antestreia: &#8220;O Dia da Revelação&#8221;</title>",
        "<title>[Terminado] Antestreia: &#8220;O Dia da Revelação&#8221;</title>",
      ),
      {
        headers: { "Content-Type": "application/rss+xml" },
      },
    );

    const result = await parse(response);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.title).toBe("[Terminado] Antestreia: “O Dia da Revelação”");
    expect(result.entries[1]?.title).toBe("[Terminado] Antestreia: “Mais Forte Que Eu”");
  });
});
