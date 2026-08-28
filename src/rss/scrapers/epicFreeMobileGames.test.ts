import { describe, expect, it } from "vitest";
import { parse } from "./epicFreeMobileGames";

describe("epicFreeMobileGames JSON parser", () => {
  it("parses the string categories returned by the Epic API", async () => {
    const result = await parse(
      {
        data: [
          {
            offers: [{ content: null }],
            type: "featured",
          },
          {
            offers: [
              {
                content: {
                  catalogItemId: "free-bundle",
                  categories: ["freegames", "bundles"],
                  mapping: { slug: "free-bundle" },
                  purchase: [
                    {
                      price: { decimalPrice: 0 },
                      purchaseType: "Claim",
                    },
                  ],
                  title: "Free bundle",
                },
              },
            ],
            type: "freeGame",
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
