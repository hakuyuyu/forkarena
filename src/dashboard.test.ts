// Runs the dashboard's inline script against a fake DOM and a canned /api/arenas/<name> response.
// run: node --test src/dashboard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DASHBOARD } from "./dashboard.ts";

const script = DASHBOARD.match(/<script>([\s\S]*)<\/script>/)![1];

async function render(search: string, respond: (url: string) => Response) {
  const els: Record<string, any> = {};
  const el = (id: string) => (els[id] ??= { innerHTML: "", value: "" });
  el("tree").innerHTML = "Pick an arena.";
  const fetched: string[] = [];
  const ctx = {
    URLSearchParams,
    location: { search },
    history: { replaceState() {} },
    document: { getElementById: el },
    fetch: async (url: string) => (fetched.push(url), respond(url)),
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
  };
  vm.runInNewContext(script, ctx);
  await new Promise((r) => setTimeout(r, 10));
  return { tree: el("tree").innerHTML, log: el("log").innerHTML, fetched };
}

const v = (
  repo: string,
  parent: string | null,
  status: string,
  views: number,
  conv: number,
  note = "",
) => ({
  repo,
  agent: repo.split("--")[1]?.split("-")[0] ?? "seed",
  parent,
  status,
  head: "",
  note,
  created: 0,
  views,
  conv,
});

test("renders the lineage tree nested by parent, with rates and escaped notes", async () => {
  const state = {
    variants: [
      v("tally", null, "dethroned", 200, 4),
      v("tally--a-1", "tally", "champion", 120, 12, "bigger <b>CTA</b>"),
      v("tally--b-2", "tally--a-1", "challenger", 0, 0),
      v("tally--c-3", "tally", "retired", 80, 1),
    ],
    log: [
      { ts: 0, kind: "promote", repo: "tally--a-1", detail: "10.0% vs 2.0%" },
    ],
  };
  const { tree, log, fetched } = await render("?arena=tally", () =>
    Response.json(state),
  );
  assert.deepEqual(fetched, ["/api/arenas/tally"]);
  assert.match(tree, /href="\/a\/tally\/"/);
  // a-1 and c-3 sit under the seed; b-2 sits under a-1, inside a-1's <li>.
  const a1 = tree.indexOf("tally--a-1"),
    b2 = tree.indexOf("tally--b-2"),
    c3 = tree.indexOf("tally--c-3");
  assert.ok(a1 < b2 && b2 < c3);
  assert.equal(tree.slice(a1, c3).match(/<\/ul>/g)?.length, 1);
  assert.match(tree, /12\/120 \(10\.0%\)/);
  assert.match(tree, /0\/0 \(-\)/);
  assert.match(tree, /bigger &lt;b&gt;CTA&lt;\/b&gt;/);
  assert.match(log, /<b class="champion">promote<\/b>/);
  assert.match(log, /10\.0% vs 2\.0%/);
});

test("no arena in the URL fetches nothing", async () => {
  const { tree, fetched } = await render("", () => Response.json({}));
  assert.deepEqual(fetched, []);
  assert.equal(tree, "Pick an arena.");
});

test("a bad arena name says so instead of leaving the old view up", async () => {
  const { tree, log } = await render(
    "?arena=Bad Name",
    () => new Response("Not found", { status: 404 }),
  );
  assert.match(tree, /No arena &quot;Bad Name&quot;/);
  assert.equal(log, "");
});
