import type { NosCinemasWatch } from "./index";

// Movies to watch for on cinemas.nos.pt. Each entry sends one email when
// sessions that match its filters appear. Edit this list to add or remove watches.
export const NOS_CINEMAS_WATCHES: ReadonlyArray<NosCinemasWatch> = [
  {
    date: ["2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"],
    keyword: "dune",
    venue: ["colombo"],
  },
];
