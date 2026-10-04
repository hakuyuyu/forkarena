import { DurableObject } from "cloudflare:workers";
import { betaSample, decide, type Variant } from "./select.ts";
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

  hit(repo: string, kind: "view" | "conv") {
    const col = kind === "view" ? "views" : "conv";
    this.sql.exec(
      `UPDATE variants SET ${col}=${col}+1 WHERE repo=? AND status IN ('champion','challenger')`,
      repo,
    );
    if (kind === "conv") this.judge();
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

  // Thompson sampling: each visitor sees a variant drawn from the posterior, so winners get more traffic.
  pick(sticky: string | null): string | undefined {
    const live = this.live();
    if (sticky && live.some((v) => v.repo === sticky)) return sticky;
    let best: string | undefined,
      top = -1;
    for (const v of live) {
      const s = betaSample(v.conv + 1, v.views - v.conv + 1);
      if (s > top) [best, top] = [v.repo, s];
    }
    return best;
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

const BEACON = (arena: string) => `<script>(function(){var u='/a/${arena}/e';
function c(){try{navigator.sendBeacon(u,'conv')}catch(e){}}
document.addEventListener('submit',c,true);
document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-convert]'))c()},true)})()</script>`;

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
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/")
      return new Response(DASHBOARD, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });

    // Public product traffic: /a/<arena>/<path>
    if (parts[0] === "a" && parts[1] && NAME.test(parts[1])) {
      const name = parts[1];
      const arena = env.ARENA.getByName(name);
      const ck = `fa_${name}`;
      if (parts[2] === "e" && req.method === "POST") {
        const repo = cookie(req, ck);
        if (repo) await arena.hit(repo, "conv");
        return new Response(null, { status: 204 });
      }
      const repo = await arena.pick(cookie(req, ck));
      if (!repo) return new Response("No variants yet", { status: 404 });
      const path = parts.slice(2).join("/") || "index.html";
      using r = await env.ARTIFACTS.get(repo);
      const file = await r.readFile({ ref: "main", path });
      if (!file) return new Response("Not found", { status: 404 });
      const headers = new Headers({
        "content-type": TYPES[path.split(".").pop()!] ?? file.type,
        "cache-control": "no-store",
      });
      headers.append(
        "set-cookie",
        `${ck}=${repo}; Path=/a/${name}; Max-Age=2592000; SameSite=Lax`,
      );
      if (path.endsWith(".html")) {
        await arena.hit(repo, "view");
        return new Response(
          (await file.text()).replace("</body>", BEACON(name) + "</body>"),
          { headers },
        );
      }
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
      return Response.json(await env.ARENA.getByName(parts[2]).state());
    }

    // POST /api/arenas {name} — admin: create the seed repo; caller pushes the first commit
    if (req.method === "POST" && url.pathname === "/api/arenas") {
      if (!bearer(req, env.ADMIN_TOKEN))
        return new Response("Unauthorized", { status: 401 });
      const { name } = await req.json<{ name: string }>();
      if (!NAME.test(name)) return new Response("Bad name", { status: 400 });
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
      if (!NAME.test(agent)) return new Response("Bad agent", { status: 400 });
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
      await arena.setStatus(v.repo, "challenger", head);
      return Response.json({ repo: v.repo, head });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
