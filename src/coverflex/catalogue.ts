import { extractTextItems } from "unpdf";
import { array, number, object, parse, string } from "valibot";
import type { InferOutput } from "valibot";
import { idempotentSendEmail } from "@email";
import { escapeHtml } from "../rss/scrapers";
import { getAuthenticationToken } from "./util";
import { CoverflexTechnologyResponseSchema } from "./schemas";
import { diffCatalogueProducts, parseCatalogueProducts } from "./catalogueProducts";
import type { CatalogueProduct, CatalogueProductsDiff } from "./catalogueProducts";

export const COVERFLEX_TECHNOLOGY_URL =
  "https://menhir-api.coverflex.com/api/employee/benefits/technology";
// Products of the last emailed catalogue as JSON. Stores the parsed products
// instead of the PDF: the PDF is ~25 MB, at the KV value limit. No TTL, so the
// next catalogue always has something to diff against.
export const COVERFLEX_APPLE_CATALOGUE_KV_KEY = "coverflex:apple_catalogue:products";
const NOTIFICATION_EMAIL = "goncalo.mendes.cabrita@gmail.com";

const StoredCatalogueSchema = object({
  name: string(),
  products: array(object({ price: number(), reference: string(), types: array(string()) })),
  url: string(),
});
type StoredCatalogue = InferOutput<typeof StoredCatalogueSchema>;

// The file URL is signed, so the query string changes on every request.
function withoutQueryString(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.href;
}

export async function getAppleCatalogueFile(env: Env) {
  const options = {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
      authorization: `Bearer ${await getAuthenticationToken(env)}`,
      "cache-control": "no-cache",
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "x-coverflex-channel": "web",
      "x-coverflex-language": "en-GB",
      "x-coverflex-version": "1.218.3",
    },
    method: "GET",
  };

  const response = await fetch(COVERFLEX_TECHNOLOGY_URL, options);

  if (response.status !== 200) {
    throw new Error(`Error:  ${response.status}`);
  }

  const json = parse(CoverflexTechnologyResponseSchema, await response.json());
  if (json.benefit.slug !== "technology") {
    throw new Error(`Response: ${JSON.stringify(json)}`);
  }

  const product = json.benefit.products.find((product) => product.slug === "apple");
  const file = product?.files.find((file) => file.slug.includes("-en-"));

  if (!file) {
    throw new Error("Apple catalogue file not found");
  }

  return { name: file.name, url: file.url };
}

async function downloadAppleCatalogue(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Coverflex Apple catalogue download returned ${response.status}`);
  }
  return response.arrayBuffer();
}

async function parseAppleCatalogue(pdf: ArrayBuffer) {
  const { items } = await extractTextItems(new Uint8Array(pdf));
  const parsed = parseCatalogueProducts(items);
  // An empty list would be stored and make the next email list every product as new.
  if (parsed.products.length === 0) {
    throw new Error("No products found in the Coverflex Apple catalogue");
  }
  return parsed;
}

async function getStoredAppleCatalogue(env: Env): Promise<StoredCatalogue | null> {
  const stored = await env.RUN_GMC_GENERIC_CACHE_KV.get(COVERFLEX_APPLE_CATALOGUE_KV_KEY);
  return stored === null ? null : parse(StoredCatalogueSchema, JSON.parse(stored));
}

const CELL = 'style="padding:4px 10px;border-bottom:1px solid #eee;vertical-align:top"';
const HEADER_CELL = 'style="padding:4px 10px;border-bottom:2px solid #ccc;text-align:left"';

function formatEuros(cents: number): string {
  return new Intl.NumberFormat("pt-PT", { currency: "EUR", style: "currency" }).format(cents / 100);
}

function formatPriceChange(previousPrice: number, price: number): string {
  const change = price - previousPrice;
  const sign = change > 0 ? "+" : "";
  const color = change < 0 ? "#116329" : "#82071e";
  const percentage = ((change / previousPrice) * 100).toFixed(1);
  return `<span style="color:${color}">${sign}${escapeHtml(formatEuros(change))} (${sign}${percentage}%)</span>`;
}

// The catalogue lists one reference per colour at the same price, so rows that
// only differ in reference are merged.
function groupProducts<T extends CatalogueProduct>(
  products: ReadonlyArray<T>,
  key: (product: T) => string,
): Array<[T, ...Array<T>]> {
  const groups = new Map<string, [T, ...Array<T>]>();
  for (const product of products) {
    const groupKey = `${product.types.join(" | ")}|${key(product)}`;
    const group = groups.get(groupKey);
    if (group) {
      group.push(product);
    } else {
      groups.set(groupKey, [product]);
    }
  }
  return [...groups.values()];
}

function renderTable(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>) {
  const head = headers.map((header) => `<th ${HEADER_CELL}>${header}</th>`).join("");
  const body = rows
    .map((cells) => `<tr>${cells.map((cell) => `<td ${CELL}>${cell}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;font-size:14px"><tr>${head}</tr>${body}</table>`;
}

function renderTypeAndReferences(
  group: readonly [CatalogueProduct, ...Array<CatalogueProduct>],
): Array<string> {
  return [
    escapeHtml(group[0].types.join(" | ")),
    `<code>${group.map((product) => escapeHtml(product.reference)).join(" ")}</code>`,
  ];
}

function renderProductList(products: ReadonlyArray<CatalogueProduct>, priceHeader: string) {
  const rows = groupProducts(products, (product) => String(product.price)).map((group) => [
    ...renderTypeAndReferences(group),
    escapeHtml(formatEuros(group[0].price)),
  ]);
  return renderTable(["Type", "Reference", priceHeader], rows);
}

function renderPriceChanges(priceChanges: CatalogueProductsDiff["priceChanges"]) {
  const rows = groupProducts(
    priceChanges,
    (product) => `${product.previousPrice}|${product.price}`,
  ).map((group) => {
    const { previousPrice, price } = group[0];
    return [
      ...renderTypeAndReferences(group),
      escapeHtml(formatEuros(previousPrice)),
      `<strong>${escapeHtml(formatEuros(price))}</strong>`,
      formatPriceChange(previousPrice, price),
    ];
  });
  return renderTable(["Type", "Reference", "Before", "Now", "Change"], rows);
}

export function buildAppleCatalogueEmailBody({
  current,
  pagesWithUnmatchedPrices,
  previous,
}: {
  current: { name: string; products: ReadonlyArray<CatalogueProduct>; url: string };
  pagesWithUnmatchedPrices: ReadonlyArray<number>;
  previous: { name: string; products: ReadonlyArray<CatalogueProduct> } | null;
}): string {
  const sections = [
    `<p><a href="${escapeHtml(current.url)}" target="_blank">${escapeHtml(current.url)}</a></p>`,
  ];
  if (pagesWithUnmatchedPrices.length > 0) {
    sections.push(
      `<p style="color:#82071e">Some prices did not match any reference, so products may be missing. Pages: ${pagesWithUnmatchedPrices.join(", ")}.</p>`,
    );
  }

  if (previous === null) {
    sections.push(
      `<p>Found ${current.products.length} products. There is no previous catalogue to compare against.</p>`,
    );
    return sections.join("\n");
  }

  const { added, priceChanges, removed } = diffCatalogueProducts(
    previous.products,
    current.products,
  );
  const comparedWith = `Compared with <strong>${escapeHtml(previous.name)}</strong>`;
  if (added.length + priceChanges.length + removed.length === 0) {
    sections.push(`<p>${comparedWith}: no product or price changes.</p>`);
    return sections.join("\n");
  }

  sections.push(
    `<p>${comparedWith}: ${priceChanges.length} price changes, ${added.length} new products, ${removed.length} removed products.</p>`,
  );
  if (priceChanges.length > 0) {
    sections.push(
      `<h3>Price changes (${priceChanges.length})</h3>`,
      renderPriceChanges(priceChanges),
    );
  }
  if (added.length > 0) {
    sections.push(`<h3>New products (${added.length})</h3>`, renderProductList(added, "Price"));
  }
  if (removed.length > 0) {
    sections.push(
      `<h3>Removed products (${removed.length})</h3>`,
      renderProductList(removed, "Last price"),
    );
  }
  return sections.join("\n");
}

export async function sendAppleCatalogueByEmail(env: Env) {
  const { name, url } = await getAppleCatalogueFile(env);
  const stableUrl = withoutQueryString(url);

  const previous = await getStoredAppleCatalogue(env);
  if (previous?.url === stableUrl) {
    return;
  }

  const { pagesWithUnmatchedPrices, products } = await parseAppleCatalogue(
    await downloadAppleCatalogue(url),
  );

  await idempotentSendEmail(env, {
    body: buildAppleCatalogueEmailBody({
      current: { name, products, url },
      pagesWithUnmatchedPrices,
      previous,
    }),
    idempotencyKey: `coverflex-apple-catalogue-${stableUrl}`,
    subject: `New Coverflex Apple catalogue available: ${name}`,
    to: NOTIFICATION_EMAIL,
  });

  // Store the products after the email, so a failed email is retried on the next run.
  await env.RUN_GMC_GENERIC_CACHE_KV.put(
    COVERFLEX_APPLE_CATALOGUE_KV_KEY,
    JSON.stringify({ name, products, url: stableUrl } satisfies StoredCatalogue),
  );
}
