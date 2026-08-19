import { describe, expect, it } from "vitest";
import { parse } from "./epicFreeMobileGames";

describe("epicFreeMobileGames JSON parser", () => {
  it("parses the string categories returned by the Epic API", async () => {
    const result = await parse(
      {
        data: [
          {
            type: "featured",
            offers: [{ content: null }],
          },
          {
            type: "freeGame",
            offers: [
              {
                content: {
                  title: "Free bundle",
                  categories: ["freegames", "bundles"],
                  catalogItemId: "free-bundle",
                  mapping: { slug: "free-bundle" },
                  purchase: [
                    {
                      purchaseType: "Claim",
                      price: { decimalPrice: 0 },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      "ios",
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: "free-bundle",
      link: "https://store.epicgames.com/en-US/bundles/free-bundle",
      title: "Free bundle",
    });
  });
});
