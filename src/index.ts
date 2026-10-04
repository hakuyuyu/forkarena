import { DurableObject } from "cloudflare:workers";
import { choose, decide, type Variant } from "./select.ts";
import { INDEXNOW_KEY, ROBOTS, SITEMAP } from "./seo.ts";
import { DASHBOARD } from "./dashboard.ts";

interface Env {
  ARTIFACTS: Artifacts;
  ARENA: DurableObjectNamespace<Arena>;
  ADMIN_TOKEN: string;
  AGENT_TOKEN: string;
}

const NAME = /^[a-z0-9][a-z0-9-]{1,40}$/;

// Artifacts reports text/plain for text files, so browsers would show the HTML source.
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  json: "application/json",
};

// One Arena per product. Holds the champion pointer, live challengers and their traffic stats.
export class Arena extends DurableObject<Env> {
  sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS variants(
      repo TEXT PRIMARY KEY, agent TEXT, parent TEXT, status TEXT, head TEXT, note TEXT,
      created INTEGER, views INTEGER DEFAULT 0, conv INTEGER DEFAULT 0)`);
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS log(ts INTEGER, kind TEXT, repo TEXT, detail TEXT)`,
    );
    // One row per visitor, so a variant's views are unique visitors and each converts at most once.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS visitors(vid TEXT PRIMARY KEY, repo TEXT, conv INTEGER DEFAULT 0)`,
    );
  }

  variants(): Variant[] {
    return this.sql
      .exec("SELECT * FROM variants ORDER BY created")
      .toArray() as unknown as Variant[];
  }

  live(): Variant[] {
    return this.variants().filter(
      (v) => v.status === "champion" || v.status === "challenger",
    );
  }

  champion(): Variant | undefined {
    return this.variants().find((v) => v.status === "champion");
  }

  note(kind: string, repo: string, detail = "") {
    this.sql.exec(
      "INSERT INTO log VALUES (?,?,?,?)",
      Date.now(),
      kind,
      repo,
      detail,
    );
  }

  add(
    repo: string,
    agent: string,
    parent: string | null,
    status: string,
    head: string,
    note: string,
  ) {
    this.sql.exec(
      "INSERT INTO variants(repo,agent,parent,status,head,note,created) VALUES (?,?,?,?,?,?,?)",
      repo,
      agent,
      parent,
      status,
      head,
      note,
      Date.now(),
    );
    this.note(
      status === "champion" ? "seed" : "fork",
      repo,
      `${agent}${parent ? " from " + parent : ""}`,
    );
  }

  setStatus(repo: string, status: string, head?: string) {
    if (head)
      this.sql.exec(
        "UPDATE variants SET status=?, head=? WHERE repo=?",
        status,
        head,
        repo,
      );
    else
      this.sql.exec("UPDATE variants SET status=? WHERE repo=?", status, repo);
  }

  hit(repo: string, col: "views" | "conv") {
    this.sql.exec(
      `UPDATE variants SET ${col}=${col}+1 WHERE repo=? AND status IN ('champion','challenger')`,
      repo,
    );
  }

  // Only a known visitor's first conversion counts, so beacon spam can't rig a promotion.
  convert(vid: string) {
    const row = this.sql
      .exec("SELECT repo FROM visitors WHERE vid=? AND conv=0", vid)
      .toArray()[0];
    if (!row) return;
    this.sql.exec("UPDATE visitors SET conv=1 WHERE vid=?", vid);
    this.hit(row.repo as string, "conv");
    this.judge();
  }

  // Selection replaces review: promote a challenger that beats the champion, retire ones that clearly lose.
  judge() {
    const champ = this.champion();
    if (!champ) return;
    for (const d of decide(
      champ,
      this.live().filter((v) => v.status === "challenger"),
    )) {
      if (d.action === "promote") {
        this.setStatus(champ.repo, "dethroned");
        this.setStatus(d.repo, "champion");
        this.note("promote", d.repo, d.why);
        return;
      }
      this.setStatus(d.repo, "retired");
      this.note("retire", d.repo, d.why);
    }
  }

  // Thompson sampling: winners get more traffic; the champion keeps a control share.
  // A returning visitor stays on their fork; a new one (or one whose fork left the arena) gets a fresh pick,
  // recorded by enter() only once a file is served, so 404 scanners don't dilute a fork's rate.
  visit(vid: string | null): { repo: string; vid: string; fresh: boolean } | undefined {
    const live = this.live();
    if (vid) {
      const row = this.sql
        .exec("SELECT repo FROM visitors WHERE vid=?", vid)
        .toArray()[0];
      if (row && live.some((v) => v.repo === row.repo))
        return { repo: row.repo as string, vid, fresh: false };
    }
    const repo = choose(live);
    if (!repo) return;
    return { repo, vid: crypto.randomUUID(), fresh: true };
  }

  // A fork that fails the ready check never gets traffic; the dashboard shows why.
  reject(repo: string, why: string) {
    this.setStatus(repo, "retired");
    this.note("retire", repo, why);
  }

  enter(vid: string, repo: string) {
    this.sql.exec("INSERT INTO visitors(vid,repo) VALUES (?,?)", vid, repo);
    this.hit(repo, "views");
  }

  state() {
    return {
      variants: this.variants(),
      log: this.sql
        .exec("SELECT * FROM log ORDER BY ts DESC LIMIT 100")
        .toArray(),
    };
  }
}

// Only a real person's form submit converts: script-dispatched submits aren't trusted events.
const BEACON = (arena: string) => `<script>(function(){var u='/a/${arena}/e';
document.addEventListener('submit',function(e){if(e.isTrusted)try{navigator.sendBeacon(u,'conv')}catch(x){}},true)})()</script>`;

// Agents are rewarded for conversions, so a fork may only change copy and layout. Any script, inline
// handler or javascript: URL that differs from its parent's could fake conversions, and is rejected.
function scripts(html: string) {
  return (
    html.match(/<script[\s\S]*?<\/script\s*>|\son[a-z]+\s*=|javascript:/gi) ?? []
  ).join("\n");
}

function withBeacon(html: string, arena: string) {
  const i = html.search(/<\/body>/i);
  return i < 0 ? html + BEACON(arena) : html.slice(0, i) + BEACON(arena) + html.slice(i);
}

function bearer(req: Request, token: string) {
  return !!token && req.headers.get("authorization") === `Bearer ${token}`;
}

function cookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") || "").match(
    new RegExp(`(?:^|; )${name}=([^;]+)`),
  );
  return m ? m[1] : null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      console.error(e);
      return new Response("Storage unavailable", { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;

function text(body: string, type = "text/plain") {
  return new Response(body, { headers: { "content-type": `${type}; charset=utf-8` } });
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/")
    return new Response(DASHBOARD, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  if (url.pathname === "/robots.txt") return text(ROBOTS);
  if (url.pathname === "/sitemap.xml") return text(SITEMAP, "application/xml");
  if (url.pathname === `/${INDEXNOW_KEY}.txt`) return text(INDEXNOW_KEY);

  // Public product traffic: /a/<arena>/<path>
  if (parts[0] === "a" && parts[1] && NAME.test(parts[1])) {
    const name = parts[1];
    const arena = env.ARENA.getByName(name);
    const ck = `fa_${name}`;
    if (parts[2] === "e" && req.method === "POST") {
      const vid = cookie(req, ck);
      if (vid) await arena.convert(vid);
      return new Response(null, { status: 204 });
    }
    if (req.method !== "GET")
      return new Response("Method not allowed", { status: 405 });
    const path = parts.slice(2).join("/") || "index.html";
    // Only index.html is served as a page, so every page a visitor sees passed the ready check.
    if (path.endsWith(".html") && path !== "index.html")
      return new Response("Not found", { status: 404 });
    const visit = await arena.visit(cookie(req, ck));
    if (!visit) return new Response("No variants yet", { status: 404 });
    const { repo, vid, fresh } = visit;
    using r = await env.ARTIFACTS.get(repo);
    const file = await r.readFile({ ref: "main", path });
    if (!file) return new Response("Not found", { status: 404 });
    if (fresh) await arena.enter(vid, repo);
    const headers = new Headers({
      "content-type": TYPES[path.split(".").pop()!] ?? file.type,
      "cache-control": "no-store",
    });
    headers.append(
      "set-cookie",
      `${ck}=${vid}; Path=/a/${name}; Max-Age=2592000; SameSite=Lax; Secure; HttpOnly`,
    );
    if (path === "index.html")
      return new Response(withBeacon(await file.text(), name), { headers });
    return new Response(file, { headers });
  }

  if (parts[0] !== "api") return new Response("Not found", { status: 404 });

  // GET /api/arenas/<arena> — public state for the dashboard
  if (
    req.method === "GET" &&
    parts[1] === "arenas" &&
    parts[2] &&
    NAME.test(parts[2])
  ) {
    const s = await env.ARENA.getByName(parts[2]).state();
    if (!s.variants.length) return new Response("No arena", { status: 404 });
    return Response.json(s);
  }

  // POST /api/arenas {name} — admin: create the seed repo; caller pushes the first commit
  if (req.method === "POST" && url.pathname === "/api/arenas") {
    if (!bearer(req, env.ADMIN_TOKEN))
      return new Response("Unauthorized", { status: 401 });
    const { name } = await req.json<{ name: string }>();
    if (typeof name !== "string" || !NAME.test(name))
      return new Response("Bad name", { status: 400 });
    if ((await env.ARENA.getByName(name).state()).variants.length)
      return new Response("Arena exists", { status: 409 });
    const created = await env.ARTIFACTS.create(name, {
      setDefaultBranch: "main",
    });
    await env.ARENA.getByName(name).add(
      name,
      "seed",
      null,
      "champion",
      "",
      "seed",
    );
    return Response.json({ remote: created.remote, token: created.token });
  }

  // POST /api/arenas/<arena>/challengers {agent, note} — agent: fork the current champion
  if (
    req.method === "POST" &&
    parts[1] === "arenas" &&
    NAME.test(parts[2]) &&
    parts[3] === "challengers" &&
    !parts[4]
  ) {
    if (!bearer(req, env.AGENT_TOKEN))
      return new Response("Unauthorized", { status: 401 });
    const name = parts[2];
    const { agent, note } = await req.json<{
      agent: string;
      note?: string;
    }>();
    if (typeof agent !== "string" || !NAME.test(agent)) return new Response("Bad agent", { status: 400 });
    const arena = env.ARENA.getByName(name);
    const champ = (await arena.state()).variants.find(
      (v) => v.status === "champion",
    );
    if (!champ) return new Response("No champion", { status: 409 });
    const repo = `${name}--${agent}-${crypto.randomUUID().slice(0, 6)}`;
    using parent = await env.ARTIFACTS.get(champ.repo);
    let fork;
    try {
      fork = await parent.fork(repo, { defaultBranchOnly: true });
    } catch (e) {
      return new Response(`Fork failed: ${e}`, { status: 503 });
    }
    const head = (await parent.log({ ref: "main", limit: 1 }))[0]?.hash ?? "";
    await arena.add(repo, agent, champ.repo, "pending", head, note ?? "");
    return Response.json({ repo, remote: fork.remote, token: fork.token });
  }

  // POST /api/arenas/<arena>/challengers/<repo>/ready — agent pushed; enter the arena if main moved
  if (
    req.method === "POST" &&
    parts[1] === "arenas" &&
    NAME.test(parts[2]) &&
    parts[3] === "challengers" &&
    parts[4] &&
    parts[5] === "ready"
  ) {
    if (!bearer(req, env.AGENT_TOKEN))
      return new Response("Unauthorized", { status: 401 });
    const arena = env.ARENA.getByName(parts[2]);
    const v = (await arena.state()).variants.find((x) => x.repo === parts[4]);
    if (!v || v.status !== "pending")
      return new Response("Not pending", { status: 409 });
    using r = await env.ARTIFACTS.get(v.repo);
    const head = (await r.log({ ref: "main", limit: 1 }))[0]?.hash ?? "";
    if (head === v.head)
      return new Response("No new commit on main", { status: 409 });
    using p = await env.ARTIFACTS.get(v.parent!);
    const page = async (x: typeof r) =>
      scripts((await (await x.readFile({ ref: "main", path: "index.html" }))?.text()) ?? "");
    if ((await page(r)) !== (await page(p))) {
      await arena.reject(v.repo, "changed page scripts");
      return new Response("Fork changed page scripts", { status: 422 });
    }
    await arena.setStatus(v.repo, "challenger", head);
    return Response.json({ repo: v.repo, head });
  }

  return new Response("Not found", { status: 404 });
}
