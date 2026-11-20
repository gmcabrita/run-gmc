import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COVERFLEX_APPLE_CATALOGUE_KV_KEY,
  COVERFLEX_TECHNOLOGY_URL,
  buildAppleCatalogueEmailBody,
  sendAppleCatalogueByEmail,
} from "./catalogue";
import type { CatalogueProduct } from "./catalogueProducts";

type PdfText = { text: string; x: number; y: number };

function buildPdf(texts: ReadonlyArray<PdfText>): Uint8Array {
  const content = texts
    .map(({ text, x, y }) => `BT /F1 12 Tf ${x} ${y} Td (${text}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function accessoriesPage(prices: ReadonlyArray<[string, string]>): Array<PdfText> {
  return [
    { text: "Apple > Mac > Accessories", x: 30, y: 700 },
    ...prices.flatMap(([reference, price], index) => [
      { text: reference, x: 30 + index * 200, y: 500 },
      { text: price, x: 30 + index * 200, y: 470 },
    ]),
  ];
}

function mockCoverflex(file: { name: string; pdf: Uint8Array; url: string }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new Request(input).url;
    if (url === COVERFLEX_TECHNOLOGY_URL) {
      return Response.json({
        benefit: {
          products: [
            {
              files: [
                {
                  name: file.name,
                  slug: "apple-en-catalogue",
                  url: `${file.url}?signature=${crypto.randomUUID()}`,
                },
              ],
              slug: "apple",
            },
          ],
          slug: "technology",
        },
      });
    }
    if (url.startsWith(`${file.url}?`)) {
      return new Response(file.pdf);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

const air = (reference: string, price: number): CatalogueProduct => ({
  price,
  reference,
  types: ["Mac > Macbook Air"],
});

function emailBody(
  previous: ReadonlyArray<CatalogueProduct> | null,
  current: ReadonlyArray<CatalogueProduct>,
) {
  return buildAppleCatalogueEmailBody({
    current: { name: "December", products: current, url: "https://files.test/december.pdf" },
    pagesWithUnmatchedPrices: [],
    previous: previous && { name: "November", products: previous },
  });
}

describe("coverflex apple catalogue email", () => {
  it("groups colour references that share a price change", () => {
    const body = emailBody(
      [air("MDH74PO/A", 117_805), air("MDHA4PO/A", 117_805), air("MDV94PO/A", 142_195)],
      [air("MDH74PO/A", 112_195), air("MDHA4PO/A", 112_195), air("MDV94PO/A", 142_195)],
    );

    expect(body).toContain("Compared with <strong>November</strong>: 2 price changes");
    expect(body).toContain("<code>MDH74PO/A MDHA4PO/A</code>");
    expect(body).toContain("-56,10\u00A0€ (-4.8%)");
    expect(body).not.toContain("MDV94PO/A");
    expect(body).not.toContain("New products");
    expect(body).not.toContain("Removed products");
  });

  it("lists new and removed products", () => {
    const body = emailBody([air("OLD", 84_472)], [air("NEW", 69_837)]);

    expect(body).toMatch(/New products \(1\)[\s\S]*NEW[\s\S]*698,37/);
    expect(body).toMatch(/Removed products \(1\)[\s\S]*OLD[\s\S]*844,72/);
  });

  it("says when nothing changed", () => {
    expect(emailBody([air("A", 100)], [air("A", 100)])).toContain("no product or price changes");
  });

  it("only counts products when there is no previous catalogue", () => {
    expect(emailBody(null, [air("A", 100)])).toContain(
      "Found 1 products. There is no previous catalogue",
    );
  });

  it("warns about prices that did not match a reference", () => {
    const body = buildAppleCatalogueEmailBody({
      current: { name: "December", products: [], url: "https://files.test/december.pdf" },
      pagesWithUnmatchedPrices: [33, 126],
      previous: null,
    });

    expect(body).toContain("products may be missing. Pages: 33, 126.");
  });

  it("escapes catalogue text", () => {
    const body = emailBody([], [{ ...air("A", 100), types: ["<b>Mac</b>"] }]);

    expect(body).toContain("&lt;b&gt;Mac&lt;/b&gt;");
  });
});

describe("sendAppleCatalogueByEmail", () => {
  beforeEach(async () => {
    // A cached token skips the Coverflex login request.
    await env.RUN_GMC_GENERIC_CACHE_KV.put("coverflex:token", "test-token");
    await env.RUN_GMC_GENERIC_CACHE_KV.delete(COVERFLEX_APPLE_CATALOGUE_KV_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emails price changes against the previous catalogue only when the file changes", async () => {
    const sendSpy = vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "1" });

    mockCoverflex({
      name: "November",
      pdf: buildPdf(accessoriesPage([["MW5M3ZM/A", "58,00EUR"]]).map(withEuroSign)),
      url: "https://files.test/november.pdf",
    });
    await sendAppleCatalogueByEmail(env);
    expect(sendSpy.mock.calls[0]?.[0]).toMatchObject({
      html: expect.stringContaining("Found 1 products"),
      subject: "New Coverflex Apple catalogue available: November",
    });

    await sendAppleCatalogueByEmail(env);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    vi.mocked(globalThis.fetch).mockRestore();
    mockCoverflex({
      name: "December",
      pdf: buildPdf(
        accessoriesPage([
          ["MW5M3ZM/A", "49,00EUR"],
          ["MW5L3ZM/A", "18,00EUR"],
        ]).map(withEuroSign),
      ),
      url: "https://files.test/december.pdf",
    });
    await sendAppleCatalogueByEmail(env);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy.mock.calls[1]?.[0]).toMatchObject({
      html: expect.stringMatching(/Price changes \(1\)[\s\S]*New products \(1\)[\s\S]*MW5L3ZM/),
      subject: "New Coverflex Apple catalogue available: December",
    });
  });
});

// Helvetica's standard encoding has no euro sign, so the PDF uses WinAnsi's
// byte for it.
function withEuroSign(text: PdfText): PdfText {
  return { ...text, text: text.text.replace("EUR", String.raw`\200`) };
}
