import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, pBetter, type Variant } from "./select.ts";

const v = (
  repo: string,
  views: number,
  conv: number,
  status: Variant["status"] = "challenger",
): Variant => ({
  repo,
  agent: "a",
  parent: null,
  status,
  head: "",
  note: "",
  created: 0,
  views,
  conv,
});

test("clear winner is promoted", () => {
  const d = decide(v("champ", 500, 10, "champion"), [v("x", 500, 40)]);
  assert.equal(d[0].action, "promote");
  assert.equal(d[0].repo, "x");
});

test("clear loser is retired", () => {
  const d = decide(v("champ", 500, 40, "champion"), [v("x", 500, 10)]);
  assert.deepEqual(
    d.map((x) => [x.action, x.repo]),
    [["retire", "x"]],
  );
});

test("too little traffic decides nothing", () => {
  assert.deepEqual(decide(v("champ", 50, 1, "champion"), [v("x", 50, 20)]), []);
});

test("stale tie is retired after MAX_VIEWS", () => {
  const d = decide(v("champ", 3000, 60, "champion"), [v("x", 3000, 61)]);
  assert.equal(d[0].action, "retire");
});

test("best of several winners is promoted", () => {
  const d = decide(v("champ", 1000, 20, "champion"), [
    v("a", 1000, 60),
    v("b", 1000, 90),
  ]);
  assert.deepEqual(
    d.map((x) => x.repo),
    ["b"],
  );
});

test("pBetter is near 0.5 for identical stats", () => {
  const p = pBetter(v("a", 400, 20), v("b", 400, 20));
  assert.ok(p > 0.4 && p < 0.6, String(p));
});
