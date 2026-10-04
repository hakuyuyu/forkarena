export interface Variant {
  repo: string;
  agent: string;
  parent: string | null;
  status: "champion" | "challenger" | "pending" | "retired" | "dethroned";
  head: string;
  note: string;
  created: number;
  views: number;
  conv: number;
}

export type Decision = {
  action: "promote" | "retire";
  repo: string;
  why: string;
};

export const MIN_VIEWS = 100;
export const MAX_VIEWS = 3000;
const DRAWS = 4000;
// Share of new visitors held for the champion, so it always reaches MIN_VIEWS and judging can run.
export const CONTROL = 0.2;
// Judging runs after every conversion, so the bar is high: in an A/A simulation (scripts/aa.ts, 3 challengers
// identical to the champion) 0.95 falsely promoted one in about half of runs; 0.999 does in about 5%.
export const PROMOTE = 0.999;

// Marsaglia–Tsang
export function gammaSample(k: number): number {
  if (k < 1) return gammaSample(k + 1) * Math.random() ** (1 / k);
  const d = k - 1 / 3,
    c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      const u1 = Math.random(),
        u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v ** 3;
    const u = Math.random();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export function betaSample(a: number, b: number) {
  const x = gammaSample(a),
    y = gammaSample(b);
  return x / (x + y);
}

// P(challenger's true conversion rate > champion's), Beta(1,1) priors.
export function pBetter(ch: Variant, champ: Variant) {
  let wins = 0;
  for (let i = 0; i < DRAWS; i++) {
    if (
      betaSample(ch.conv + 1, ch.views - ch.conv + 1) >
      betaSample(champ.conv + 1, champ.views - champ.conv + 1)
    )
      wins++;
  }
  return wins / DRAWS;
}

// The best clear winner is promoted; clear losers and stale ties are retired.
export function decide(champ: Variant, challengers: Variant[]): Decision[] {
  const out: Decision[] = [];
  let best: { v: Variant; p: number } | undefined;
  for (const v of challengers) {
    if (v.views < MIN_VIEWS || champ.views < MIN_VIEWS) continue;
    const p = pBetter(v, champ);
    const stats = `${v.conv}/${v.views} vs ${champ.conv}/${champ.views}, P(better)=${p.toFixed(3)}`;
    const rate = (x: Variant) => (x.conv + 1) / (x.views + 2);
    if (p > PROMOTE) { if (!best || rate(v) > rate(best.v)) best = { v, p }; }
    else if (p < 0.05)
      out.push({ action: "retire", repo: v.repo, why: `loses: ${stats}` });
    else if (v.views >= MAX_VIEWS)
      out.push({
        action: "retire",
        repo: v.repo,
        why: `no clear edge: ${stats}`,
      });
  }
  if (best) {
    const { v, p } = best;
    return [
      {
        action: "promote",
        repo: v.repo,
        why: `${v.conv}/${v.views} beats ${champ.conv}/${champ.views}, P(better)=${p.toFixed(3)}`,
      },
    ];
  }
  return out;
}

// Thompson sampling over live variants, with a fixed control share for the champion.
export function choose(live: Variant[]): string | undefined {
  const champ = live.find((v) => v.status === "champion");
  if (champ && live.length > 1 && Math.random() < CONTROL) return champ.repo;
  let best: string | undefined,
    top = -1;
  for (const v of live) {
    const s = betaSample(v.conv + 1, v.views - v.conv + 1);
    if (s > top) [best, top] = [v.repo, s];
  }
  return best;
}
