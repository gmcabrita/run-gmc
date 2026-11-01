import type { NosCinemasWatch } from "./index";

// Movies to watch for on cinemas.nos.pt. Each entry sends one email when
// sessions that match its filters appear. Edit this list to add or remove watches.
export const NOS_CINEMAS_WATCHES: ReadonlyArray<NosCinemasWatch> = [
  {
    date: ["2026-11-15", "2026-11-20", "2026-11-21", "2026-11-22"],
    keyword: "you can see everything",
    venue: ["vasco da gama", "amoreiras", "colombo"],
  },
];
