import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const API_BASE = "https://menhir-api.coverflex.com/api";

function loadDevVars(): Record<string, string> {
  const devVarsPath = path.join(process.cwd(), ".dev.vars");
  if (!fs.existsSync(devVarsPath)) return {};

  const content = fs.readFileSync(devVarsPath, "utf-8");
  const vars: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts) vars[key] = valueParts.join("=");
  }

  return vars;
}

const COMMON_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
  "content-type": "application/json",
  priority: "u=1, i",
  "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  Referer: "https://my.coverflex.com/",
};

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
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
): Promise<{ token: string; refresh_token: string }> {
  const payload: { email: string; password: string; otp?: string } = {
    email,
    password,
  };
  if (otp) {
    payload.otp = `${otp}`;
  }

  const response = await fetch(`${API_BASE}/employee/sessions`, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed: ${response.status} - ${text}`);
  }

  return response.json();
}

async function trustUserAgent(token: string): Promise<string> {
  const response = await fetch(`${API_BASE}/employee/sessions/trust-user-agent`, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trust user agent failed: ${response.status} - ${text}`);
  }

  const json: any = await response.json();
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
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
