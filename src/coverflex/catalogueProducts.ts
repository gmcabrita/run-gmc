export type PdfTextItem = {
  str: string;
  width: number;
  x: number;
  y: number;
};

export type CatalogueProduct = {
  // Euro cents.
  price: number;
  reference: string;
  // Category paths without the leading "Apple >", e.g. "Mac > Macbook Air". An
  // accessory can be listed under more than one category.
  types: Array<string>;
};

export type CatalogueProductsDiff = {
  added: Array<CatalogueProduct>;
  priceChanges: Array<CatalogueProduct & { previousPrice: number }>;
  removed: Array<CatalogueProduct>;
};

export type ParsedCatalogue = {
  // Pages with a price that is not the nearest price to any reference, which
  // usually means a reference format that APPLE_REFERENCE does not know yet.
  pagesWithUnmatchedPrices: Array<number>;
  products: Array<CatalogueProduct>;
};

// Apple part numbers, e.g. MHFC4PO/A, MW5M3ZM/A, MQDP3Z/A.
const APPLE_REFERENCE = /\b[A-Z0-9]{4,5}[A-Z]{1,3}\/A\b/g;
const SPACE = String.raw`[\s\u00a0\u202f]`;
const EURO_AMOUNT = `(\\d{1,3}(?:${SPACE}\\d{3})+|\\d+)`;
// Prices are written as "730,89€", "1 950.41€", "2 064,23 €" or "87€". The
// lookbehinds skip AppleCare add-ons ("+138,00€") and avoid matching inside a
// longer number.
const PRICE = new RegExp(
  `(?<![+\\d,.])(?<!\\d${SPACE})${EURO_AMOUNT}(?:[.,](\\d{1,2}))?${SPACE}?€`,
  "g",
);
// One catalogue price was missing its euro sign. Accept that only when the
// number is the whole line, so spec values are not mistaken for prices.
const BARE_PRICE = new RegExp(`^${EURO_AMOUNT},(\\d{2})$`, "g");
const PRICE_RANGE = /€\s*-\s*\d/;
const CATEGORY_PREFIX = "Apple >";
// pdf.js splits some words into separate items ("673,98" and "€", or
// "Wi" + "‑" + "Fi"). Items on the same baseline closer than this many points
// belong to the same line.
const MAX_WORD_GAP = 15;

type TextLine = {
  end: number;
  segments: Array<{ charWidth: number; offset: number; x: number }>;
  text: string;
  y: number;
};

type Match = { groups: RegExpMatchArray; x: number; y: number };

function toLines(items: ReadonlyArray<PdfTextItem>): Array<TextLine> {
  const lines: Array<TextLine> = [];
  const sorted = items.filter((item) => item.str !== "").toSorted((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const charWidth = item.width / item.str.length;
    const line = lines.find(
      (line) =>
        Math.abs(line.y - item.y) < 1 && item.x >= line.end - 1 && item.x - line.end < MAX_WORD_GAP,
    );
    if (line) {
      if (item.x - line.end > 1) {
        line.text += " ";
      }
      line.segments.push({ charWidth, offset: line.text.length, x: item.x });
      line.text += item.str;
      line.end = item.x + item.width;
    } else {
      lines.push({
        end: item.x + item.width,
        segments: [{ charWidth, offset: 0, x: item.x }],
        text: item.str,
        y: item.y,
      });
    }
  }
  return lines;
}

function findMatches(line: TextLine, pattern: RegExp, text = line.text): Array<Match> {
  return [...text.matchAll(pattern)].map((groups) => {
    const index = groups.index ?? 0;
    const segment = line.segments.findLast(({ offset }) => offset <= index) ?? line.segments[0];
    return {
      groups,
      x: segment ? segment.x + segment.charWidth * (index - segment.offset) : 0,
      y: line.y,
    };
  });
}

function toCents([, euros = "", cents = ""]: RegExpMatchArray): number {
  return Number(euros.replaceAll(/\D/g, "")) * 100 + Number(cents.padEnd(2, "0"));
}

function distance(a: Match, b: Match): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Pairs each Apple reference with the nearest price on its page. Product pages
// show one price for all colour references, and accessory pages are grids where
// each price sits right below its reference.
export function parseCatalogueProducts(
  pages: ReadonlyArray<ReadonlyArray<PdfTextItem>>,
): ParsedCatalogue {
  const products = new Map<string, CatalogueProduct>();
  const pagesWithUnmatchedPrices: Array<number> = [];

  pages.forEach((items, pageIndex) => {
    const lines = toLines(items);
    const category = lines
      .map((line) => line.text.trim())
      .find((text) => text.startsWith(CATEGORY_PREFIX));
    // Pages without a category, like the how-to page, only show example references.
    if (category === undefined) {
      return;
    }
    const type = category.slice(CATEGORY_PREFIX.length).trim();
    const prices = lines.flatMap((line) =>
      PRICE_RANGE.test(line.text)
        ? []
        : [...findMatches(line, PRICE), ...findMatches(line, BARE_PRICE, line.text.trim())],
    );
    const references = lines.flatMap((line) => findMatches(line, APPLE_REFERENCE));
    const matchedPrices = new Set<Match>();

    for (const reference of references) {
      const price = prices.reduce<Match | undefined>(
        (nearest, candidate) =>
          nearest === undefined || distance(candidate, reference) < distance(nearest, reference)
            ? candidate
            : nearest,
        undefined,
      );
      const code = reference.groups[0];
      if (price === undefined) {
        throw new Error(`Apple catalogue reference ${code} on page ${pageIndex + 1} has no price`);
      }
      matchedPrices.add(price);
      const existing = products.get(code);
      if (existing) {
        if (!existing.types.includes(type)) {
          existing.types.push(type);
        }
      } else {
        products.set(code, { price: toCents(price.groups), reference: code, types: [type] });
      }
    }

    if (references.length > 0 && prices.some((price) => !matchedPrices.has(price))) {
      pagesWithUnmatchedPrices.push(pageIndex + 1);
    }
  });

  return { pagesWithUnmatchedPrices, products: [...products.values()] };
}

export function diffCatalogueProducts(
  previous: ReadonlyArray<CatalogueProduct>,
  current: ReadonlyArray<CatalogueProduct>,
): CatalogueProductsDiff {
  const previousByReference = new Map(previous.map((product) => [product.reference, product]));
  const currentReferences = new Set(current.map((product) => product.reference));
  const priceChanges: CatalogueProductsDiff["priceChanges"] = [];
  const added: Array<CatalogueProduct> = [];

  for (const product of current) {
    const before = previousByReference.get(product.reference);
    if (before === undefined) {
      added.push(product);
    } else if (before.price !== product.price) {
      priceChanges.push({ ...product, previousPrice: before.price });
    }
  }

  return {
    added,
    priceChanges,
    removed: previous.filter((product) => !currentReferences.has(product.reference)),
  };
}
