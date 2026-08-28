import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { object, parse, string } from "valibot";

const CoverflexAuthResponseSchema = object({
  refresh_token: string(),
  token: string(),
});
const TrustedUserAgentResponseSchema = object({
  user_agent_token: string(),
});

const API_BASE = "https://menhir-api.coverflex.com/api";

function loadDevVars() {
  const vars: Record<string, string> = {};
  const devVarsPath = join(process.cwd(), ".dev.vars");
  if (!existsSync(devVarsPath)) {return vars;}

  const content = readFileSync(devVarsPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {continue;}
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts) {vars[key] = valueParts.join("=");}
  }

  return vars;
}

const COMMON_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
  "content-type": "application/json",
  priority: "u=1, i",
  Referer: "https://my.coverflex.com/",
  "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
};

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function authenticate(
  email: string,
  password: string,
  otp?: string,
): Promise<{ refresh_token: string; token: string; }> {
  const payload = otp ? { email, otp, password } : { email, password };

  const response = await fetch(`${API_BASE}/employee/sessions`, {
    body: JSON.stringify(payload),
    headers: COMMON_HEADERS,
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed: ${response.status} - ${text}`);
  }

  return parse(CoverflexAuthResponseSchema, await response.json());
}

async function trustUserAgent(token: string): Promise<string> {
  const response = await fetch(`${API_BASE}/employee/sessions/trust-user-agent`, {
    headers: {
      ...COMMON_HEADERS,
      authorization: `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trust user agent failed: ${response.status} - ${text}`);
  }

  const json = parse(TrustedUserAgentResponseSchema, await response.json());
  return json.user_agent_token;
}

async function main() {
  const devVars = loadDevVars();
  const email = devVars.COVERFLEX_EMAIL || (await prompt("Email: "));
  const password = devVars.COVERFLEX_PASSWORD || (await prompt("Password: "));

  // First auth request (triggers OTP)
  console.log("\nAuthenticating...");
  try {
    await authenticate(email, password);
  } catch {
    // Expected to fail or return partial response, OTP will be sent
  }

  const otp = await prompt("OTP Code: ");

  // Second auth request with OTP
  console.log("\nAuthenticating with OTP...");
  const authResult = await authenticate(email, password, otp);
  console.log("Token:", authResult.token);
  console.log("Refresh Token:", authResult.refresh_token);

  // Get user agent token
  console.log("\nGetting user agent token...");
  const userAgentToken = await trustUserAgent(authResult.token);
  console.log("\nUser Agent Token:", userAgentToken);

  console.log(
    "\nMake sure to update:\n$EDITOR .dev.vars\npnpm wrangler secret put COVERFLEX_USER_AGENT_TOKEN",
  );
}

try {
  await main();
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
