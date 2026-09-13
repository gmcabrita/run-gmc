import type { NosCinemasWatch } from "./index";

// Movies to watch for on cinemas.nos.pt. Each entry sends one email when
// sessions that match its filters appear. Edit this list to add or remove watches.
export const NOS_CINEMAS_WATCHES: ReadonlyArray<NosCinemasWatch> = [
  { date: ["2026-12-19"], keyword: "dune", venue: ["colombo"] },
  { date: ["2026-12-19"], keyword: "doomsday", venue: ["colombo"] },
];
