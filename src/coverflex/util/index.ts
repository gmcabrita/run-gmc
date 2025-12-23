export async function getAuthenticationToken(env: CloudflareBindings) {
  const authUrl = "https://menhir-api.coverflex.com/api/employee/sessions";
  const authOptions = {
    headers: {
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
    },
    body: JSON.stringify({
      email: env.COVERFLEX_EMAIL,
      password: env.COVERFLEX_PASSWORD,
      user_agent_token: env.COVERFLEX_USER_AGENT_TOKEN,
    }),
    referrer: "https://my.coverflex.com/",
    method: "POST",
  };
  const authResponse = await fetch(authUrl, authOptions);
  const authJson: any = await authResponse.json();
  return authJson.token;
}
