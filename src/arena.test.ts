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
        readFile: async ({ path }: { path: string }) =>
          path === "index.html" ? new Response(page) : null,
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

test("requests for missing files create no visitor and no view", async () => {
  const { arena, fetch, stats } = setup();
  for (const p of ["/a/tally/wp-login.php", "/a/tally/.env", "/a/tally/x/y"]) {
    const r = await fetch(p);
    assert.equal(r.status, 404);
    assert.equal(r.headers.get("set-cookie"), null);
  }
  assert.deepEqual(stats(), { seed: [0, 0], "seed--a-1": [0, 0] });
  assert.equal(
    arena.sql.exec("SELECT count(*) AS n FROM visitors").toArray()[0].n,
    0,
  );
});

// Fake Artifacts with per-repo heads, so the agent API's fork → push → ready flow can run.
function apiSetup() {
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
  const heads: Record<string, string> = {};
  const pages: Record<string, string> = {};
  const repo = (name: string) => ({
    readFile: async () =>
      new Response(pages[name] ?? `<html><body>${name}</body></html>`),
    log: async () => (heads[name] ? [{ hash: heads[name] }] : []),
    fork: async (to: string) => {
      heads[to] = heads[name];
      return { remote: `https://git.test/${to}`, token: "t" };
    },
    [Symbol.dispose]() {},
  });
  const env = {
    ADMIN_TOKEN: "admin",
    AGENT_TOKEN: "agent",
    ARENA: { getByName: () => arena },
    ARTIFACTS: {
      get: async (name: string) => repo(name),
      create: async (name: string) => {
        heads[name] = "c0";
        return { remote: `https://git.test/${name}`, token: "t" };
      },
    },
  } as any;
  const call = (path: string, token: string, body: unknown = {}) =>
    worker.fetch(
      new Request(`https://fa.test${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      env,
    );
  return { arena, env, heads, pages, call };
}

test("agent API: fork is pending and unserved until a new commit lands, then joins", async () => {
  const { arena, heads, call } = apiSetup();
  assert.equal((await call("/api/arenas", "agent", { name: "tally" })).status, 401);
  assert.equal((await call("/api/arenas", "admin", { name: "tally" })).status, 200);
  assert.equal(
    (await call("/api/arenas/tally/challengers", "admin", { agent: "agent-1" })).status,
    401,
  );
  assert.equal(
    (await call("/api/arenas/tally/challengers", "agent", { agent: "Bad Name" })).status,
    400,
  );
  const r = await call("/api/arenas/tally/challengers", "agent", { agent: "agent-1", note: "idea" });
  assert.equal(r.status, 200);
  const { repo } = await r.json<{ repo: string }>();
  assert.match(repo, /^tally--agent-1-/);
  assert.deepEqual(
    arena.variants().map((v) => [v.repo, v.status, v.parent]),
    [["tally", "champion", null], [repo, "pending", "tally"]],
  );
  assert.equal(arena.live().length, 1);
  const ready = `/api/arenas/tally/challengers/${repo}/ready`;
  assert.equal((await call(ready, "agent")).status, 409);
  heads[repo] = "c1";
  assert.equal((await call(ready, "agent")).status, 200);
  assert.equal(arena.variants()[1].status, "challenger");
  assert.equal(arena.variants()[1].head, "c1");
  assert.equal((await call(ready, "agent")).status, 409);
});

test("ready and challenger routes reject a bad arena name", async () => {
  const { call } = apiSetup();
  for (const path of [
    "/api/arenas/BAD!/challengers",
    "/api/arenas/BAD!/challengers/x/ready",
    "/api/nope/tally/challengers/x/ready",
  ])
    assert.equal((await call(path, "agent", { agent: "agent-1" })).status, 404, path);
});

test("real traffic promotes the fork that converts and the dashboard state shows it", async () => {
  const { arena, env, heads, call } = apiSetup();
  await call("/api/arenas", "admin", { name: "tally" });
  const { repo } = await (
    await call("/api/arenas/tally/challengers", "agent", { agent: "agent-1" })
  ).json<{ repo: string }>();
  heads[repo] = "c1";
  await call(`/api/arenas/tally/challengers/${repo}/ready`, "agent");
  const visitors: { cookie: string; repo: string }[] = [];
  while (arena.variants().some((v) => v.views < 120)) {
    const r = await worker.fetch(new Request("https://fa.test/a/tally/"), env);
    visitors.push({
      cookie: r.headers.get("set-cookie")!.split(";")[0],
      repo: (await r.text()).match(/<body>([^<]+)/)![1],
    });
  }
  for (const v of visitors.filter((v) => v.repo === repo).slice(0, 20))
    await worker.fetch(
      new Request("https://fa.test/a/tally/e", { method: "POST", headers: { cookie: v.cookie } }),
      env,
    );
  const s = await (
    await worker.fetch(new Request("https://fa.test/api/arenas/tally"), env)
  ).json<{ variants: { repo: string; status: string }[]; log: { kind: string; repo: string }[] }>();
  assert.deepEqual(
    s.variants.map((v) => [v.repo, v.status]),
    [["tally", "dethroned"], [repo, "champion"]],
  );
  assert.equal(s.log[0].kind, "promote");
  assert.equal(s.log[0].repo, repo);
});

test("a fork that adds or changes a script is rejected before it gets traffic", async () => {
  const { arena, heads, pages, call } = apiSetup();
  await call("/api/arenas", "admin", { name: "tally" });
  for (const cheat of [
    "<script>navigator.sendBeacon('/a/tally/e')</script>",
    '<img src=x onerror="fetch(1)">',
    '<a href="javascript:void 0">x</a>',
  ]) {
    const { repo } = await (
      await call("/api/arenas/tally/challengers", "agent", { agent: "agent-1" })
    ).json<{ repo: string }>();
    heads[repo] = "c1";
    pages[repo] = `<html><body>${cheat}</body></html>`;
    const r = await call(`/api/arenas/tally/challengers/${repo}/ready`, "agent");
    assert.equal(r.status, 422, cheat);
    assert.equal(arena.variants().find((v) => v.repo === repo)!.status, "retired");
  }
  assert.equal(arena.live().length, 1);
});

test("arena admin and state routes: no duplicates, unknown arena is 404, only GET counts", async () => {
  const { call, env } = apiSetup();
  assert.equal((await call("/api/arenas", "admin", {})).status, 400);
  assert.equal((await call("/api/arenas", "admin", { name: "tally" })).status, 200);
  assert.equal((await call("/api/arenas", "admin", { name: "tally" })).status, 409);
  const get = (p: string, method = "GET") =>
    worker.fetch(new Request(`https://fa.test${p}`, { method }), env);
  assert.equal((await get("/a/tally/", "HEAD")).status, 405);
  assert.equal((await get("/a/tally/other.html")).status, 404);
  const r = await get("/a/tally/");
  assert.match(r.headers.get("set-cookie")!, /Secure; HttpOnly/);
});

test("the beacon is added even without a lowercase </body>", async () => {
  const { pages, call, env } = apiSetup();
  await call("/api/arenas", "admin", { name: "tally" });
  for (const page of ["<HTML><BODY>x</BODY></HTML>", "<p>no body tag"]) {
    pages.tally = page;
    const html = await (
      await worker.fetch(new Request("https://fa.test/a/tally/"), env)
    ).text();
    assert.match(html, /sendBeacon/);
  }
});
