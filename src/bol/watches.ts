import type { BolWatch } from "./index";

// Events to watch for on bol.pt venue pages. Each available event that matches
// a watch is emailed once, even when several watches match it.
// Edit this list to add or remove watches.
export const BOL_WATCHES: ReadonlyArray<BolWatch> = [
  { keyword: "the debut", page: "https://leffest.bol.pt/" },
  { keyword: "soudain", page: "https://leffest.bol.pt/" },
];
