import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { idempotentSendEmail } from "@email";

const RASPBERRY_PI_ZERO_2W_URL =
  "https://mauser.pt/096-4559/raspberry-pi-sc1176-microcomputador-raspberry-pi-zero-2w-c-wifi-bluetooth";
const RASPBERRY_PI_ZERO_2W_EMAIL = "goncalo.mendes.cabrita@gmail.com";
const RASPBERRY_PI_ZERO_2W_ID = "mauser-096-4559-raspberry-pi-zero-2w";

type MauserStockStatus =
  | { kind: "in-stock"; label: string }
  | { kind: "out-of-stock"; label: string }
  | { kind: "unknown"; reason: string };

type MauserCheckResult =
  | { kind: "in-stock"; label: string; emailSent: boolean }
  | { kind: "out-of-stock"; label: string }
  | { kind: "forbidden"; statusCode: 403; emailSent: boolean }
  | { kind: "unknown"; reason: string };

export function parseMauserStockStatus(html: string): MauserStockStatus {
  const stockStatusTag = html.match(/<div[^>]*class="([^"]*\bstock-status\b[^"]*)"[^>]*>/i);
  if (!stockStatusTag) {
    return { kind: "unknown", reason: "stock status block not found" };
  }

  const classNames = stockStatusTag[1];
  const stockStatusIndex = stockStatusTag.index;
  if (classNames === undefined || stockStatusIndex === undefined) {
    return { kind: "unknown", reason: "stock status block malformed" };
  }

  const stockStatusText = htmlToText(html.slice(stockStatusIndex, stockStatusIndex + 3_000));
  if (hasClass(classNames, "sold-out") || stockStatusText.includes("Indisponível")) {
    return { kind: "out-of-stock", label: "Indisponível" };
  }
  if (stockStatusText.includes("Esgotado")) {
    return { kind: "out-of-stock", label: "Esgotado" };
  }
  if (stockStatusText.includes("Em Stock")) {
    return { kind: "in-stock", label: "Em Stock" };
  }
  if (stockStatusText.includes("Disponível")) {
    return { kind: "in-stock", label: "Disponível" };
  }

  return { kind: "unknown", reason: "stock status label not found" };
}

export async function checkMauserRaspberryPiZero2WStock(
  env: CloudflareBindings,
): Promise<MauserCheckResult> {
  const response = await fetch(RASPBERRY_PI_ZERO_2W_URL, {
    headers: mauserHeaders(),
    method: "GET",
    redirect: "follow",
  });

  if (response.status === 403) {
    const emailSent = await idempotentSendEmail(env, {
      to: RASPBERRY_PI_ZERO_2W_EMAIL,
      subject: "Mauser stock check 403",
      body: `<p>Mauser stock check got HTTP 403.</p><p><a href="${RASPBERRY_PI_ZERO_2W_URL}" target="_blank">${RASPBERRY_PI_ZERO_2W_URL}</a></p>`,
      idempotencyKey: `${RASPBERRY_PI_ZERO_2W_ID}-403-${utcDateKey(new Date())}`,
    });

    return { kind: "forbidden", statusCode: 403, emailSent };
  }

  if (!response.ok) {
    throw new Error(`Mauser stock check failed: ${response.status}`);
  }

  const status = parseMauserStockStatus(await response.text());
  switch (status.kind) {
    case "in-stock": {
      const emailSent = await idempotentSendEmail(env, {
        to: RASPBERRY_PI_ZERO_2W_EMAIL,
        subject: "Mauser Raspberry Pi Zero 2 W in stock",
        body: `<p>${status.label}</p><p><a href="${RASPBERRY_PI_ZERO_2W_URL}" target="_blank">${RASPBERRY_PI_ZERO_2W_URL}</a></p>`,
        idempotencyKey: `${RASPBERRY_PI_ZERO_2W_ID}-in-stock`,
      });

      return { kind: "in-stock", label: status.label, emailSent };
    }
    case "out-of-stock":
      return { kind: "out-of-stock", label: status.label };
    case "unknown":
      return { kind: "unknown", reason: status.reason };
  }
}

export function addMauserEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get(
    "/mauser.checkRaspberryPiZero2WStock",
    async (ctx, next) => {
      const auth = basicAuth({
        username: ctx.env.PRIVATE_BASIC_AUTH_USERNAME,
        password: ctx.env.PRIVATE_BASIC_AUTH_PASSWORD,
      });
      return auth(ctx, next);
    },
    async (ctx) => {
      return ctx.json(await checkMauserRaspberryPiZero2WStock(ctx.env));
    },
  );
}

function mauserHeaders(): Headers {
  return new Headers({
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
    "cache-control": "no-cache",
    cookie: "",
    pragma: "no-cache",
    priority: "u=0, i",
    "sec-ch-ua": '"Chromium";v="146", "Google Chrome";v="146", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasClass(classNames: string, className: string): boolean {
  return classNames.split(/\s+/).includes(className);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
