import type { BolWatch } from "./index";

// Events to watch for on bol.pt venue pages. Each available event that matches
// a watch is emailed once, even when several watches match it.
// Edit this list to add or remove watches.
export const BOL_WATCHES: ReadonlyArray<BolWatch> = [
  { keyword: "the debut", page: "https://cinemasaojorge.bol.pt/" },
  { keyword: "a grande estreia", page: "https://cinemasaojorge.bol.pt/" },
  { keyword: "a estreia", page: "https://cinemasaojorge.bol.pt/" },
  { keyword: "soudain", page: "https://cinemasaojorge.bol.pt/" },
  { keyword: "all of a sudden", page: "https://cinemasaojorge.bol.pt/" },
  { keyword: "de repente", page: "https://cinemasaojorge.bol.pt/" },
  { keyword: "the wishful", page: "https://cinemasaojorge.bol.pt/" },
];
