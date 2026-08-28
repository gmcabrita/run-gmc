import { describe, expect, it } from "vitest";
import {
  getDiscordHealthcheckFailureMessage,
  getDiscordHealthcheckFailurePayload,
  getDiscordHealthcheckPassMessage,
  getDiscordHealthcheckPassPayload,
  getHttpRelayHealthcheckUrl,
  getRssHealthcheckFailureReason,
  getRssHealthcheckPaths,
  rssFeedHasAtLeastOneEntry,
  runRssHealthcheck,
  summarizeRssHealthcheck,
} from "./healthcheck";

describe("getRssHealthcheckPaths", () => {
  it("returns rss routes except excluded ones", () => {
    expect(
      getRssHealthcheckPaths([
        { method: "GET", path: "/rss.cinecartaz" },
        { method: "GET", path: "/rss.x" },
        { method: "GET", path: "/rss.discordQuests" },
        { method: "GET", path: "/rss.sendCinecartazEntriesByEmail" },
        { method: "GET", path: "/rss.sendCinemaxRtpPassatemposEntriesByEmail" },
        { method: "GET", path: "/rss.cacheAgendaLx" },
        { method: "GET", path: "/rss.agendaLx" },
        { method: "POST", path: "/rss.only-post" },
        { method: "GET", path: "/not-rss" },
        { method: "GET", path: "/rss.agendaLx" },
      ]),
    ).toEqual(["/rss.agendaLx", "/rss.cinecartaz"]);
  });
});

describe("rssFeedHasAtLeastOneEntry", () => {
  it("returns true when rss contains an item", () => {
    expect(
      rssFeedHasAtLeastOneEntry(`<?xml version="1.0"?><rss><channel><item></item></channel></rss>`),
    ).toBe(true);
  });

  it("returns false when rss contains no items", () => {
    expect(
      rssFeedHasAtLeastOneEntry(`<?xml version="1.0"?><rss><channel></channel></rss>`),
    ).toBe(false);
  });
});

describe("runRssHealthcheck", () => {
  it("fetches paths, checks items, and summarizes failures", async () => {
    const response = await runRssHealthcheck(
      ["/rss.a", "/rss.b", "/rss.c"],
      "https://run.gmcabrita.com",
      async (url) => {
        if (url === "https://run.gmcabrita.com/rss.a") {
          return {
            body: "<rss><channel><item></item></channel></rss>",
            ok: true,
            statusCode: 200,
          };
        }

        if (url === "https://run.gmcabrita.com/rss.b") {
          return {
            body: "<rss><channel></channel></rss>",
            ok: true,
            statusCode: 200,
          };
        }

        return {
          body: "",
          ok: false,
          statusCode: 500,
        };
      },
    );

    expect(response).toEqual({
      failures: [
        { statusCode: 200, url: "https://run.gmcabrita.com/rss.b" },
        { statusCode: 500, url: "https://run.gmcabrita.com/rss.c" },
      ],
      summary: {
        failed: 2,
        passed: 1,
      },
    });
  });

  it("marks thrown fetches as failed", async () => {
    await expect(
      runRssHealthcheck(["/rss.a"], "https://run.gmcabrita.com", async () => {
        throw new Error("failed");
      }),
    ).resolves.toEqual({
      failures: [{ statusCode: 500, url: "https://run.gmcabrita.com/rss.a" }],
      summary: {
        failed: 1,
        passed: 0,
      },
    });
  });

  it("checks extra urls by status only", async () => {
    const response = await runRssHealthcheck(
      ["/rss.a"],
      "https://run.gmcabrita.com",
      async (url) => {
        if (url === "https://run.gmcabrita.com/rss.a") {
          return {
            body: "<rss><channel><item></item></channel></rss>",
            ok: true,
            statusCode: 200,
          };
        }

        return {
          body: "",
          ok: true,
          statusCode: 200,
        };
      },
      ["https://relay.example.com/healthz"],
    );

    expect(response).toEqual({
      failures: [],
      summary: {
        failed: 0,
        passed: 2,
      },
    });
  });
});

describe("getHttpRelayHealthcheckUrl", () => {
  it("appends healthz to the relay url", () => {
    expect(getHttpRelayHealthcheckUrl("https://relay.example.com/")).toBe(
      "https://relay.example.com/healthz",
    );
  });
});

describe("summarizeRssHealthcheck", () => {
  it("counts passes and returns only failures", () => {
    expect(
      summarizeRssHealthcheck([
        { passed: true, statusCode: 200, url: "https://run.gmcabrita.com/rss.a" },
        { passed: false, statusCode: 502, url: "https://run.gmcabrita.com/rss.b" },
        { passed: false, statusCode: 200, url: "https://run.gmcabrita.com/rss.c" },
      ]),
    ).toEqual({
      failures: [
        { statusCode: 502, url: "https://run.gmcabrita.com/rss.b" },
        { statusCode: 200, url: "https://run.gmcabrita.com/rss.c" },
      ],
      summary: {
        failed: 2,
        passed: 1,
      },
    });
  });
});

describe("getRssHealthcheckFailureReason", () => {
  it("returns undefined when healthcheck passed", () => {
    expect(
      getRssHealthcheckFailureReason({
        failures: [],
        summary: { failed: 0, passed: 1 },
      }),
    ).toBeUndefined();
  });

  it("returns failures array contents when healthcheck failed", () => {
    expect(
      getRssHealthcheckFailureReason({
        failures: [
          {
            url: "https://run.gmcabrita.com/rss.a",
            // Keep the established JSON field order used in healthcheck messages.
            statusCode: 500,
          },
        ],
        summary: { failed: 1, passed: 0 },
      }),
    ).toBe('[{"url":"https://run.gmcabrita.com/rss.a","statusCode":500}]');
  });
});

describe("getDiscordHealthcheckFailureMessage", () => {
  it("formats the Discord failure message", () => {
    expect(getDiscordHealthcheckFailureMessage("Internal Server Error")).toBe(
      "run.gmc healthcheck failed: Internal Server Error",
    );
  });
});

describe("getDiscordHealthcheckPassMessage", () => {
  it("formats the Discord pass message", () => {
    expect(getDiscordHealthcheckPassMessage()).toBe("run.gmc healthcheck passed");
  });
});

describe("getDiscordHealthcheckFailurePayload", () => {
  it("formats failures as Discord embeds", () => {
    expect(
      getDiscordHealthcheckFailurePayload({
        failures: [
          { statusCode: 500, url: "https://run.gmcabrita.com/rss.informacaoLisboa" },
          { statusCode: 502, url: "https://run.gmcabrita.com/rss.reutersMediaTelecom" },
        ],
        summary: { failed: 2, passed: 2 },
      }),
    ).toEqual({
      embeds: [
        {
          color: 0xff_3b_30,
          description: "2 failed, 2 passed",
          fields: [
            {
              inline: false,
              name: "500 /rss.informacaoLisboa",
              value: "<https://run.gmcabrita.com/rss.informacaoLisboa>",
            },
            {
              inline: false,
              name: "502 /rss.reutersMediaTelecom",
              value: "<https://run.gmcabrita.com/rss.reutersMediaTelecom>",
            },
          ],
          title: "run.gmc healthcheck failed",
        },
      ],
    });
  });
});

describe("getDiscordHealthcheckPassPayload", () => {
  it("formats passes as Discord embeds", () => {
    expect(
      getDiscordHealthcheckPassPayload({
        failures: [],
        summary: { failed: 0, passed: 2 },
      }),
    ).toEqual({
      embeds: [
        {
          color: 0x34_c7_59,
          description: "2 checks passed",
          title: "run.gmc healthcheck passed",
        },
      ],
    });
  });
});
