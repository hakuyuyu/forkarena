// The one timing source for the Demo: chapter lengths follow the narration, and both
// the scenes and audio/demo-mix.ts read these times.
import { VO } from "./demo-durations.ts";

export const DFPS = 60;
export const LEAD = 0.9; // picture leads the voice into each chapter
export const TAIL = 1.5; // breath after the last word
export const ORDER = ["hook", "idea", "arch", "create", "swarm", "agent", "diffs", "traffic", "judge", "gen2", "scale", "run", "close"] as const;
export type ChapterId = (typeof ORDER)[number];

let start = 0;
export const CH = ORDER.map((id) => {
  const c = { id, start, vo: start + LEAD, voLen: VO[id], dur: LEAD + VO[id] + TAIL };
  start += c.dur;
  return c;
});
export const DEMO_DURATION = start + 1.5;
