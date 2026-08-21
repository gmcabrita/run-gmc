import { describe, expect, it } from "vitest";
import { USERAGENT } from "@rss/common";
import { parse, scrapeMediaApi } from "./expressoMedia";

const API_URL =
  "https://expresso.pt/api/gs/expresso/v1/molecule/feed?categories=%2Fmedia-comunicacao&category=media-comunicacao&contentTypes=ARTICLE%2CSTREAM%2CNEWSLETTER%2CVIDEO&limit=20";
const RELAY_URL = "https://relay.test";
const RELAY_ENV = {
  HTTP_RELAY_URL: RELAY_URL,
  HTTP_RELAY_TOKEN: "relay-token",
};

const apiResponse = {
  contents: [
    {
      type: "ARTICLE",
      uuid: "58da653d-08ba-4cf3-9122-4aa569f31780",
      code: "29454280",
      link: "/media-comunicacao/2026-08-05-financas-poem-em-causa-legalidade-de-subsidios-na-rtp-fdc9bf6b",
      title: "Finanças põem em causa legalidade de subsídios na RTP",
      lead: "<p>A RTP suspendeu novos subsídios &amp; pediu uma análise.</p>",
      publishedDate: "2026-08-05T12:53:33.465Z",
      picture: {
        urlLandscape: "https://images.impresa.pt/expresso/rtp.jpg?v=w620h395",
      },
    },
    {
      type: "VIDEO",
      code: "28887613",
      link: "/media-comunicacao/2026-05-12-video-radar-e-oxigenio-5a272ef1",
      headlineTitle: "Radar e Oxigénio fora do ar",
      tickerDescription: "As emissões continuam online.",
      publishedDate: "invalid",
      lastModifiedDate: "2026-05-12T13:58:40.565Z",
      picture: {
        urlOriginal: "https://images.impresa.pt/expresso/radios.jpg",
      },
    },
    {
      type: "ARTICLE",
      uuid: "missing-link",
      title: "Entry without a link",
    },
    {
      type: "UNSUPPORTED",
      uuid: "unsupported",
      link: "/unsupported",
      title: "Unsupported content",
    },
  ],
};

function createApiResponse() {
  return new Response(JSON.stringify(apiResponse), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("expressoMedia scraper", () => {
  it("parses Expresso media entries", () => {
    const result = parse(apiResponse);

    expect(result).toMatchObject({
      id: "https://expresso.pt/media-comunicacao",
      link: "https://expresso.pt/media-comunicacao",
      title: "Expresso - Media e Comunicação",
      description: "Expresso Media e Comunicação",
      language: "pt",
    });
    expect(result.entries).toEqual([
      {
        id: "58da653d-08ba-4cf3-9122-4aa569f31780",
        link: "https://expresso.pt/media-comunicacao/2026-08-05-financas-poem-em-causa-legalidade-de-subsidios-na-rtp-fdc9bf6b",
        title: "Finanças põem em causa legalidade de subsídios na RTP",
        text: "A RTP suspendeu novos subsídios & pediu uma análise.",
        datetime: new Date("2026-08-05T12:53:33.465Z"),
        imageURL: "https://images.impresa.pt/expresso/rtp.jpg?v=w620h395",
      },
      {
        id: "28887613",
        link: "https://expresso.pt/media-comunicacao/2026-05-12-video-radar-e-oxigenio-5a272ef1",
        title: "Radar e Oxigénio fora do ar",
        text: "As emissões continuam online.",
        datetime: new Date("2026-05-12T13:58:40.565Z"),
        imageURL: "https://images.impresa.pt/expresso/radios.jpg",
      },
    ]);
  });

  it("fetches the API through the HTTP relay", async () => {
    const requests: Request[] = [];
    const relayFetcher: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return createApiResponse();
    };

    const result = await scrapeMediaApi(RELAY_ENV, relayFetcher);

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.url).toBe(`${RELAY_URL}/${API_URL}`);
    expect(request.headers.get("authorization")).toBe("Bearer relay-token");
    expect(request.headers.get("accept")).toBe("application/json, text/plain, */*");
    expect(request.headers.get("referer")).toBe("https://expresso.pt/media-comunicacao/");
    expect(request.headers.get("user-agent")).toBe(USERAGENT);
    expect(result.entries).toHaveLength(2);
  });

  it("reports failed API requests", async () => {
    const relayFetcher: typeof fetch = async () => new Response(null, { status: 403 });

    await expect(scrapeMediaApi(RELAY_ENV, relayFetcher)).rejects.toThrow(
      "Expresso media request failed: 403",
    );
  });
});
