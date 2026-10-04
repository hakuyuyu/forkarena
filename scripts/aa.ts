// A/A check of the promotion rule: a champion and 3 challengers all convert at 5%, judged after every
// conversion as Arena.convert does. Any promotion is a false one. usage: node scripts/aa.ts [runs]
import { choose, decide, type Variant } from "../src/select.ts";

const RUNS = Number(process.argv[2] ?? 200);
let wrong = 0;
for (let r = 0; r < RUNS; r++) {
  const vs = ["champ", "a", "b", "c"].map(
    (repo, i): Variant => ({ repo, agent: repo, parent: null, status: i ? "challenger" : "champion", head: "", note: "", created: 0, views: 0, conv: 0 }),
  );
  for (let t = 0; t < 20000; t++) {
    const live = vs.filter((v) => v.status === "champion" || v.status === "challenger");
    if (live.length < 2) break;
    const pick = choose(live);
    const v = vs.find((x) => x.repo === pick)!;
    v.views++;
    if (Math.random() >= 0.05) continue;
    v.conv++;
    const ds = decide(live.find((x) => x.status === "champion")!, live.filter((x) => x.status === "challenger"));
    if (ds.some((d) => d.action === "promote")) { wrong++; break; }
    for (const d of ds) vs.find((x) => x.repo === d.repo)!.status = "retired";
  }
}
console.log(`false promotions: ${wrong}/${RUNS} (${((100 * wrong) / RUNS).toFixed(1)}%)`);
