import { describe, expect, it } from "vitest";
import { diffCatalogueProducts, parseCatalogueProducts } from "./catalogueProducts";
import type { CatalogueProduct, PdfTextItem } from "./catalogueProducts";

function item(str: string, x: number, y: number): PdfTextItem {
  return { str, width: str.length * 6, x, y };
}

function cablePage(category: string): Array<PdfTextItem> {
  return [
    item(`Apple > ${category}`, 30, 700),
    item("MW653ZM/A", 30, 500),
    item("33,00€", 30, 470),
  ];
}

function product(reference: string, price: number): CatalogueProduct {
  return { price, reference, types: ["Mac > Macbook Air"] };
}

describe("parseCatalogueProducts", () => {
  it("gives every colour reference on a product page the product price", () => {
    const page = [
      item("13-inch MacBook Neo 512GB", 30, 640),
      item("730,89€", 30, 615),
      item("Apple > Mac > Macbook Neo", 30, 590),
      item("Add AppleCare for MacBook Pro +138,00€", 250, 110),
      item("MHFC4PO/A", 260, 90),
      item("MHFG4PO/A", 360, 90),
    ];

    expect(parseCatalogueProducts([page])).toEqual({
      pagesWithUnmatchedPrices: [],
      products: [
        { price: 73_089, reference: "MHFC4PO/A", types: ["Mac > Macbook Neo"] },
        { price: 73_089, reference: "MHFG4PO/A", types: ["Mac > Macbook Neo"] },
      ],
    });
  });

  it("pairs each reference on a grid page with the price below it", () => {
    const page = [
      item("Apple > Mac > Accessories", 30, 700),
      item("MW5M3ZM/A", 30, 500),
      item("MW5L3ZM/A", 230, 500),
      item("MW653ZM/A", 430, 500),
      item("58,00€", 30, 470),
      item("18,00€", 230, 470),
      item("33,00€", 430, 470),
      item("MQDP3Z/A", 30, 300),
      item("1 950.41€", 30, 270),
    ];

    expect(
      parseCatalogueProducts([page]).products.map(({ price, reference }) => [reference, price]),
    ).toEqual([
      ["MW5M3ZM/A", 5800],
      ["MW5L3ZM/A", 1800],
      ["MW653ZM/A", 3300],
      ["MQDP3Z/A", 195_041],
    ]);
  });

  it("joins words that the PDF splits into separate items", () => {
    const page = [
      item("Apple > iPad > iPad mini Wi", 30, 700),
      item("‑", 192, 700),
      item("Fi", 198, 700),
      item("673,98", 30, 500),
      item("€", 70, 500),
      item("MH304TY/A", 30, 470),
    ];

    expect(parseCatalogueProducts([page]).products).toEqual([
      { price: 67_398, reference: "MH304TY/A", types: ["iPad > iPad mini Wi‑Fi"] },
    ]);
  });

  it("reads prices without cents and a price without a euro sign", () => {
    const page = [
      item("Apple > Mac > Accessories", 30, 700),
      item("MXK63ZM/A", 30, 500),
      item("87€", 30, 470),
      item("MDFW4PO/A", 230, 500),
      item("283,74", 230, 470),
      item("MHQN4TY/A", 430, 500),
      item("1 300€", 430, 470),
    ];

    expect(parseCatalogueProducts([page]).products.map(({ price }) => price)).toEqual([
      8700, 28_374, 130_000,
    ]);
  });

  it("ignores price ranges and pages without a category", () => {
    const howTo = [item("Ex; MGN63PO/A", 30, 500), item("10€", 30, 470)];
    const macMini = [
      item("877,24€ - 1 649,59€", 30, 620),
      item("Apple > Mac > Mac mini", 30, 590),
      item("MHQK4TY/A", 30, 300),
      item("877,24€", 30, 270),
    ];

    expect(parseCatalogueProducts([howTo, macMini])).toEqual({
      pagesWithUnmatchedPrices: [],
      products: [{ price: 87_724, reference: "MHQK4TY/A", types: ["Mac > Mac mini"] }],
    });
  });

  it("merges the categories of a reference listed on several pages", () => {
    expect(
      parseCatalogueProducts([cablePage("Mac > Accessories"), cablePage("iPad > Accessories")])
        .products,
    ).toEqual([
      { price: 3300, reference: "MW653ZM/A", types: ["Mac > Accessories", "iPad > Accessories"] },
    ]);
  });

  it("reports pages with prices that no reference uses", () => {
    const page = [
      item("Apple > Mac > Accessories", 30, 700),
      item("MW5M3ZM/A", 30, 500),
      item("58,00€", 30, 470),
      item("UNKNOWN-REF", 230, 500),
      item("18,00€", 230, 470),
    ];

    expect(parseCatalogueProducts([page]).pagesWithUnmatchedPrices).toEqual([1]);
  });

  it("fails when a page with references has no price", () => {
    const page = [item("Apple > Mac > Accessories", 30, 700), item("MW5M3ZM/A", 30, 500)];

    expect(() => parseCatalogueProducts([page])).toThrow("MW5M3ZM/A on page 1 has no price");
  });
});

describe("diffCatalogueProducts", () => {
  it("finds added, removed and repriced products by reference", () => {
    expect(
      diffCatalogueProducts(
        [product("A", 100), product("B", 200), product("C", 300)],
        [product("A", 100), product("B", 250), product("D", 400)],
      ),
    ).toEqual({
      added: [product("D", 400)],
      priceChanges: [{ ...product("B", 250), previousPrice: 200 }],
      removed: [product("C", 300)],
    });
  });
});
