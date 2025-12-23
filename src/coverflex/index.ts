import { Hono } from "hono";
import { getAuthenticationToken } from "./util";
import { basicAuth } from "hono/basic-auth";
import { idempotentSendEmail } from "@email";

async function getAppleCatalogueFile(env: CloudflareBindings) {
  const url = "https://menhir-api.coverflex.com/api/employee/benefits/technology";
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

  const response = await fetch(url, options);

  if (response.status !== 200) {
    throw new Error(`Error:  ${response.status}`);
  }

  const json: any = await response.json();
  if (json.benefit.slug != "technology") {
    throw new Error(`Response: ${JSON.stringify(json)}`);
  }

  const product = json.benefit.products.find((product: any) => product.slug == "apple");
  const file = product.files.find((file: any) => file.slug.includes("-en-"));

  return { name: file.name, url: file.url };
}

async function getCoverflexBudget(env: CloudflareBindings) {
  const url = "https://menhir-api.coverflex.com/api/employee/pockets";
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

  const response = await fetch(url, options);

  if (response.status !== 200) {
    throw new Error(`Error:  ${response.status}`);
  }

  const json: any = await response.json();
  const pocket = json.pockets.find((pocket: any) => pocket.type == "meals");
  const currentBudget = pocket.balance.amount / 100;

  return { budget: `${currentBudget}€` };
}

export function addCoverflexEndpoints(app: Hono<{ Bindings: CloudflareBindings }>) {
  app.get(
    "/coverflex.getBudget",
    async (c, next) => {
      const auth = basicAuth({
        username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
        password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
      });
      return auth(c, next);
    },
    async (c) => {
      return c.json(await getCoverflexBudget(c.env));
    },
  );

  app.get(
    "/coverflex.getAppleCatalogue",
    async (c, next) => {
      const auth = basicAuth({
        username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
        password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
      });
      return auth(c, next);
    },
    async (c) => {
      return c.json(await getAppleCatalogueFile(c.env));
    },
  );

  app.get(
    "/coverflex.sendAppleCatalogueByEmail",
    async (c, next) => {
      const auth = basicAuth({
        username: c.env.PRIVATE_BASIC_AUTH_USERNAME,
        password: c.env.PRIVATE_BASIC_AUTH_PASSWORD,
      });
      return auth(c, next);
    },
    async (c) => {
      const { name, url } = await getAppleCatalogueFile(c.env);

      await idempotentSendEmail(c.env, {
        to: "goncalo@mendescabrita.com",
        subject: `New Coverflex Apple catalogue available: ${name}`,
        body: `<a href="${url}" target="_blank">${url}</a>`,
        idempotencyKey: `coverflex-apple-catalogue-${name}`,
      });

      return c.text("");
    },
  );
}
