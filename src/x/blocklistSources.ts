import { parseScreenName, parseTargetList, type BlocklistSource } from "./blocklist";

// To add a source, write a `BlocklistSource` and add it to `X_BLOCKLIST_SOURCES`.
// Use `parseScreenName` for handles and `parseUserId` for numeric user IDs.

const CLANKWALL_USERNAMES_URL = "https://clankwall.vogel.dev/api/usernames.txt";

export const clankwallSource: BlocklistSource = {
  async fetchTargets() {
    const response = await fetch(CLANKWALL_USERNAMES_URL);
    if (!response.ok) {
      throw new Error(`${CLANKWALL_USERNAMES_URL} returned HTTP ${response.status}`);
    }
    return parseTargetList(await response.text(), parseScreenName);
  },
  name: "clankwall",
};

export const X_BLOCKLIST_SOURCES: ReadonlyArray<BlocklistSource> = [clankwallSource];
