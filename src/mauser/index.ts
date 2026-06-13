import { idempotentSendEmail } from "@email";
import { createProxiedFetch } from "../proxiedFetch";

const MAUSER_SC1176_PRODUCT_URL =
  "https://mauser.pt/096-4559/raspberry-pi-sc1176-microcomputador-raspberry-pi-zero-2w-c-wifi-bluetooth";
const MAUSER_SC1176_PRODUCT_SKU = "096-4559";
const MAUSER_SC1176_PRODUCT_NAME =
  "Raspberry Pi SC1176 - Microcomputador Raspberry Pi Zero 2W - c/ WiFi + Bluetooth";
const MAUSER_STOCK_STATE_KV_KEY = "mauser-sc1176-stock-state";
const EMAIL_RECIPIENT = "goncalo.mendes.cabrita@gmail.com";

export type MauserStockStatus = "in_stock" | "out_of_stock";

interface MauserStockState {
  status: MauserStockStatus;
  observedAt: string;
}

export interface MauserStockCheckResult {
  status: MauserStockStatus;
  evidence: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMauserStockState(raw: string | null): MauserStockState | undefined {
  if (raw === null) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  const status = parsed.status;
  const observedAt = parsed.observedAt;
  if ((status === "in_stock" || status === "out_of_stock") && typeof observedAt === "string") {
    return { status, observedAt };
  }

  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dailyKey(date: Date): string {
  return date.toISOString().slice(0, "YYYY-MM-DD".length);
}

function normalizeText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function findStockStatus(html: string): { classes: string; snippet: string } | undefined {
  const match = /<div\b(?=[^>]*\bstock-status\b)[^>]*\bclass=["']([^"']*)["'][^>]*>/i.exec(html);
  const classes = match?.[1];
  const index = match?.index;
  if (classes === undefined || index === undefined) {
    return undefined;
  }

  return {
    classes,
    snippet: html.slice(index, index + 1_500),
  };
}

export function parseMauserSc1176StockPage(html: string): MauserStockCheckResult {
  if (!html.includes(MAUSER_SC1176_PRODUCT_SKU)) {
    throw new Error(`Mauser product page missing SKU ${MAUSER_SC1176_PRODUCT_SKU}`);
  }

  const stockStatus = findStockStatus(html);
  if (!stockStatus) {
    throw new Error("Mauser product page missing stock status");
  }

  const evidence = normalizeText(stockStatus.snippet);
  const normalizedClasses = stockStatus.classes.toLowerCase();
  const normalizedEvidence = evidence.toLowerCase();
  if (
    normalizedClasses.split(/\s+/).includes("sold-out") ||
    normalizedEvidence.includes("indisponível") ||
    normalizedEvidence.includes("sem previsão") ||
    normalizedEvidence.includes("esgotado")
  ) {
    return {
      status: "out_of_stock",
      evidence,
    };
  }

  if (
    normalizedClasses.split(/\s+/).includes("in-stock") ||
    normalizedClasses.split(/\s+/).includes("available") ||
    normalizedEvidence.includes("em stock") ||
    /\bdispon[ií]vel\b/i.test(evidence)
  ) {
    return {
      status: "in_stock",
      evidence,
    };
  }

  throw new Error(`Unknown Mauser stock status: ${evidence}`);
}

async function fetchMauserSc1176Stock(env: CloudflareBindings): Promise<MauserStockCheckResult> {
  const response = await createProxiedFetch(env)(MAUSER_SC1176_PRODUCT_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://mauser.pt/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Mauser request failed: ${response.status} ${response.statusText}`);
  }

  return parseMauserSc1176StockPage(await response.text());
}

async function reportMauserSc1176Stock(
  env: CloudflareBindings,
  result: MauserStockCheckResult,
  checkedAt: Date,
): Promise<void> {
  const previous = parseMauserStockState(
    await env.RUN_GMC_GENERIC_CACHE_KV.get(MAUSER_STOCK_STATE_KV_KEY),
  );

  if (result.status === "in_stock" && previous?.status !== "in_stock") {
    await idempotentSendEmail(env, {
      to: EMAIL_RECIPIENT,
      subject: "Mauser has Raspberry Pi SC1176 in stock",
      body: `<p>${escapeHtml(MAUSER_SC1176_PRODUCT_NAME)} is in stock.</p>
<p><a href="${MAUSER_SC1176_PRODUCT_URL}">${MAUSER_SC1176_PRODUCT_URL}</a></p>
<p>Evidence: ${escapeHtml(result.evidence)}</p>`,
      idempotencyKey: `mauser-sc1176-restocked-${previous?.observedAt ?? "initial"}`,
    });
  }

  await env.RUN_GMC_GENERIC_CACHE_KV.put(
    MAUSER_STOCK_STATE_KV_KEY,
    JSON.stringify({ status: result.status, observedAt: checkedAt.toISOString() }),
  );
}

async function sendMauserSc1176FailureEmail(
  env: CloudflareBindings,
  error: unknown,
  checkedAt: Date,
): Promise<void> {
  await idempotentSendEmail(env, {
    to: EMAIL_RECIPIENT,
    subject: "Mauser Raspberry Pi SC1176 stock check failed",
    body: `<p>Mauser Raspberry Pi SC1176 stock check failed.</p>
<p><a href="${MAUSER_SC1176_PRODUCT_URL}">${MAUSER_SC1176_PRODUCT_URL}</a></p>
<p>${escapeHtml(errorMessage(error))}</p>`,
    idempotencyKey: `mauser-sc1176-check-failed-${dailyKey(checkedAt)}`,
  });
}

export async function checkMauserSc1176StockAndNotify(
  env: CloudflareBindings,
  checkedAt: Date = new Date(),
): Promise<MauserStockCheckResult> {
  try {
    const result = await fetchMauserSc1176Stock(env);
    await reportMauserSc1176Stock(env, result, checkedAt);
    return result;
  } catch (error) {
    await sendMauserSc1176FailureEmail(env, error, checkedAt);
    throw error;
  }
}
