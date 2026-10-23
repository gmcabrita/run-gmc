import type { NosCinemasWatch } from "./index";

// Movies to watch for on cinemas.nos.pt. Each entry sends one email when
// sessions that match its filters appear. Edit this list to add or remove watches.
export const NOS_CINEMAS_WATCHES: ReadonlyArray<NosCinemasWatch> = [
  { date: ["2026-11-06"], keyword: "fjord", venue: ["vasco da gama"] },
  { date: ["2026-11-15"], keyword: "tender loving care", venue: ["vasco da gama"] },
];
