// agent.sh and swarm.sh against a fake Worker API and local bare repos standing in for Artifacts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "fa-agent-"));
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

// A seed repo with index.html; each fork is a bare clone of it.
const seed = join(work, "seed");
git("init", "-q", "-b", "main", seed);
writeFileSync(join(seed, "index.html"), "<h1>Tallybook</h1>\n");
git("-C", seed, "add", "-A");
git("-C", seed, "-c", "user.name=s", "-c", "user.email=s@x", "commit", "-qm", "seed");

const calls = [];
let n = 0;
const server = createServer((req, res) => {
  calls.push(req.url);
  if (req.url.endsWith("/challengers")) {
    const repo = `t--fork${++n}`;
    git("clone", "-q", "--bare", seed, join(work, `${repo}.git`));
    res.end(JSON.stringify({ repo, remote: `https://fake.test/${repo}.git`, token: "tok" }));
  } else res.end("{}");
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}`;

// Async spawn: a sync one would block the fake API server in this same process.
async function run(script, args, agentCmd) {
  const tmp = mkdtempSync(join(work, "tmp-"));
  const p = spawn(join(root, "scripts", script), args, {
    env: {
      ...process.env,
      FA_URL: url,
      AGENT_TOKEN: "t",
      AGENT_CMD: agentCmd,
      TMPDIR: tmp,
      // Send https://x:tok@fake.test/<repo> to the local bare repo.
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${work}/.insteadOf`,
      GIT_CONFIG_VALUE_0: "https://x:tok@fake.test/",
    },
  });
  let stdout = "", stderr = "";
  p.stdout.on("data", (d) => (stdout += d));
  p.stderr.on("data", (d) => (stderr += d));
  const status = await new Promise((r) => p.on("close", r));
  return { status, stdout, stderr, leftover: readdirSync(tmp) };
}

const edit = join(work, "edit.sh");
writeFileSync(edit, '#!/bin/sh\ncase "$1" in *FAIL*) exit 3;; *NOOP*) exit 0;; esac\necho "<p>new</p>" >> index.html\n', { mode: 0o755 });

test("agent pushes its change, signals ready, and cleans up", async () => {
  calls.length = 0;
  const r = await run("agent.sh", ["t", "a1", "add a line"], edit);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /a1 -> t--fork\d+/);
  const repo = r.stdout.match(/t--fork\d+/)[0];
  assert.match(git("-C", join(work, `${repo}.git`), "log", "-1", "--format=%s", "main"), /a1: add a line/);
  assert.deepEqual(calls, ["/api/arenas/t/challengers", `/api/arenas/t/challengers/${repo}/ready`]);
  assert.deepEqual(r.leftover, []);
});

test("agent that changes nothing fails loudly, skips ready, and removes the token-bearing clone", async () => {
  calls.length = 0;
  const r = await run("agent.sh", ["t", "a2", "NOOP"], edit);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /a2: agent made no change/);
  assert.deepEqual(calls, ["/api/arenas/t/challengers"]);
  assert.deepEqual(r.leftover, []);
});

test("failing agent command is reported and cleaned up", async () => {
  calls.length = 0;
  const r = await run("agent.sh", ["t", "a3", "FAIL"], edit);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /a3: agent command failed/);
  assert.deepEqual(calls, ["/api/arenas/t/challengers"]);
  assert.deepEqual(r.leftover, []);
});

test("swarm exits non-zero and counts failed agents", async () => {
  const ideas = join(work, "ideas.txt");
  writeFileSync(ideas, "add a line\n\nFAIL here\nadd another\n");
  const r = await run("swarm.sh", ["t", ideas], edit);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /1 of 3 agents failed/);
  assert.equal((r.stdout.match(/ -> /g) || []).length, 2);
});

test.after(() => server.close());
