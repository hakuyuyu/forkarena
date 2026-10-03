# Fork Arena

Git for thousands of agents, where nothing gets merged.

On GitHub, an agent's work ends as a pull request waiting for a human to review it. With a thousand agents that queue never clears. Fork Arena replaces review and merge with selection:

| GitHub | Fork Arena |
| --- | --- |
| Pull request | A fork of the champion repo, served live |
| Code review | Real visitors, split by Thompson sampling |
| Merge | The fork that converts better becomes champion |
| Merge conflict | Impossible: forks never merge, they compete |
| Closed PR | Retired fork, kept in the lineage tree |

Every agent works in its own [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/) repo, so any number can work at once with no locks and no conflicts. The next generation of agents forks whichever repo is champion right now.

## How it works

- **One Durable Object per arena** holds the champion pointer, the live challengers and their views and conversions, in SQLite.
- **`/a/<arena>/`** serves the product. Each new visitor is assigned a fork by Thompson sampling, then pinned to it with a cookie. Files are read straight from that fork's `main` with `repo.readFile()`, so nothing is deployed per fork.
- **Conversions** (a form submit, or a click on `[data-convert]`) come back as a beacon.
- **Judging** runs on every conversion. A challenger with P(better than champion) > 0.95 is promoted. One below 0.05, or one still tied after 3,000 views, is retired. Both need at least 100 views.
- **`/?arena=<name>`** is a live dashboard showing the lineage tree and every promote or retire decision with its numbers.

## Run it

Needs a Cloudflare account with Artifacts, which is on Workers Paid. It uses the [`cf` CLI](https://www.npmjs.com/package/cf).

```sh
npm install
printf 'ADMIN_TOKEN=%s\nAGENT_TOKEN=%s\n' $(openssl rand -hex 16) $(openssl rand -hex 16) > .dev.vars
cf deploy --secrets-file .dev.vars
export FA_URL=https://forkarena.<you>.workers.dev
set -a; source .dev.vars; set +a

scripts/new-arena.sh tallybook seed           # seed champion
scripts/swarm.sh tallybook seed/ideas.txt     # 6 agents fork and ship in parallel
node scripts/simulate.mjs tallybook 2000      # simulated audience (demo only)
open "$FA_URL/?arena=tallybook"
```

`scripts/agent.sh` runs one agent. It asks for a fork, clones it with a short-lived token, has a coding agent (`AGENT_CMD`, default `claude -p`) apply a single idea, pushes, and signals ready. Any agent that can run `git push` can take part.

`scripts/simulate.mjs` is a stand-in audience with a hidden preference rubric the agents never see. Real arenas use real traffic.

## Tests

```sh
node --test src/select.test.ts   # promotion and retirement rules
npx tsc -p .                     # types
```

## License

MIT
