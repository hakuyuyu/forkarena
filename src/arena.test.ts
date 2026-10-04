// End-to-end over the worker's fetch handler, with an in-memory Durable Object (node:sqlite) and fake Artifacts.
// run: node --js-explicit-resource-management --test src/arena.test.ts
import { test } from "node:test";
import { register } from "node:module";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// Node can't load cloudflare:workers; resolve it to a stub DurableObject base class.
const stub = `export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }`;
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
  if (s === "cloudflare:workers") return { url: "data:text/javascript," + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(s, c);
}`),
);
const { Arena, default: worker } = await import("./index.ts");

function setup() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q: string, ...binds: unknown[]) {
      const st = db.prepare(q);
      const rows = /^\s*select/i.test(q)
        ? st.all(...(binds as any[]))
        : (st.run(...(binds as any[])), []);
      return { toArray: () => rows };
    },
  };
  const arena = new Arena({ storage: { sql } } as any, {} as any);
  const page = "<html><body><h1>Tallybook</h1></body></html>";
  const env = {
    ARENA: { getByName: () => arena },
    ARTIFACTS: {
      get: async () => ({
        readFile: async () => new Response(page),
        [Symbol.dispose]() {},
      }),
    },
  } as any;
  arena.add("seed", "seed", null, "champion", "", "seed");
  arena.add("seed--a-1", "a", "seed", "challenger", "h", "");
  const fetch = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`https://fa.test${path}`, init), env);
  const stats = () =>
    Object.fromEntries(
      arena.variants().map((v) => [v.repo, [v.views, v.conv]]),
    );
  return { arena, fetch, stats };
}

test("a returning visitor is one view, pinned to their fork", async () => {
  const { fetch, stats } = setup();
  const r = await fetch("/a/tally/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /sendBeacon/);
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  for (let i = 0; i < 5; i++) await fetch("/a/tally/", { headers: { cookie } });
  const s = Object.values(stats());
  assert.equal(
    s.reduce((n, [views]) => n + views, 0),
    1,
  );
});

test("repeated conversion beacons from one visitor count once", async () => {
  const { fetch, stats } = setup();
  const r = await fetch("/a/tally/");
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  for (let i = 0; i < 50; i++)
    assert.equal(
      (await fetch("/a/tally/e", { method: "POST", headers: { cookie } }))
        .status,
      204,
    );
  const s = Object.values(stats());
  assert.deepEqual(
    [s.reduce((n, [v]) => n + v, 0), s.reduce((n, [, c]) => n + c, 0)],
    [1, 1],
  );
});

test("a forged cookie converts nothing", async () => {
  const { fetch, stats } = setup();
  for (const cookie of ["fa_tally=seed--a-1", "fa_tally=not-a-visitor"])
    await fetch("/a/tally/e", { method: "POST", headers: { cookie } });
  assert.deepEqual(stats(), { seed: [0, 0], "seed--a-1": [0, 0] });
});

test("a visitor whose fork was retired is reassigned and counted again", async () => {
  const { arena, fetch, stats } = setup();
  let cookie = "";
  let repo = "";
  while (repo !== "seed--a-1") {
    const r = await fetch("/a/tally/");
    cookie = r.headers.get("set-cookie")!.split(";")[0];
    repo = arena.sql
      .exec("SELECT repo FROM visitors ORDER BY rowid DESC LIMIT 1")
      .toArray()[0].repo;
  }
  const before = stats().seed[0];
  arena.setStatus("seed--a-1", "retired");
  await fetch("/a/tally/", { headers: { cookie } });
  assert.equal(stats().seed[0], before + 1);
});
