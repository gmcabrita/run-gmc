import { USERAGENT, isValidRSSEntry } from "@rss/common";
import type { RSSData, RSSEntry } from "@rss/types";
import type { ScyllaDbEventsResponse } from "@types";

const BASE_URL = "https://www.scylladb.com/company/events/";
const API_URL = "https://www.scylladb.com/wp-admin/admin-ajax.php";

export async function parse(json: ScyllaDbEventsResponse): Promise<RSSData> {
  const now = new Date();
  const links = (json.past + json.upcoming).match(
    /https:\/\/lp\.scylladb\.com[^\s"'<>\[\]]*/g
  );

  const entries: RSSEntry[] = (links ?? []).map((link) => ({
    id: link,
    link,
    title: link,
    text: link,
    datetime: now,
  }));

  return {
    id: BASE_URL,
    link: BASE_URL,
    title: "ScyllaDB Masterclass Events",
    description: "ScyllaDB Masterclass Events",
    language: "en",
    entries: entries.filter(isValidRSSEntry),
  };
}

export async function get(): Promise<RSSData> {
  const options = {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8,pt;q=0.7",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": USERAGENT,
    },
  };

  // First, fetch the base page to get the security token
  const baseResponse = await fetch(BASE_URL, options);
  if (baseResponse.status !== 200) {
    throw new Error(`${baseResponse.status}: ${baseResponse.statusText} – ${BASE_URL}`);
  }

  const baseText = await baseResponse.text();
  const security = baseText?.match(/"security":"([^"]+)"}/)?.[1];

  if (!security) {
    throw new Error("No security token found!");
  }

  // Then fetch the events
  const response = await fetch(API_URL, {
    ...options,
    method: "POST",
    body: `action=load_filtered_events&security=${security}&category_slug=masterclasses`,
  });

  if (response.status !== 200) {
    throw new Error(`${response.status}: ${response.statusText} – ${API_URL}`);
  }

  const json = (await response.json()) as ScyllaDbEventsResponse;
  return parse(json);
}
