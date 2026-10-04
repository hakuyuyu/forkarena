#!/bin/bash
# One agent: fork the champion, try one idea, push, enter the arena.
# usage: scripts/agent.sh <arena> <agent-name> "<idea>"
# env: FA_URL (Worker URL), AGENT_TOKEN, AGENT_CMD (default: claude -p --model sonnet --permission-mode acceptEdits --setting-sources project)
set -euo pipefail
arena=$1 agent=$2 idea=$3
: "${FA_URL:?set FA_URL}" "${AGENT_TOKEN:?set AGENT_TOKEN}"
# --setting-sources project keeps the operator's own hooks and plugins (memory, session history) out of the agent.
AGENT_CMD=${AGENT_CMD:-claude -p --model sonnet --permission-mode acceptEdits --setting-sources project}
api() {
  local body=${2:-'{}'}
  curl -sSf --retry 3 --retry-all-errors -X POST -H "authorization: Bearer $AGENT_TOKEN" -H 'content-type: application/json' "$FA_URL/api/arenas/$arena/$1" -d "$body"
}
fail() { echo "$agent: $*" >&2; exit 1; }

out=$(api challengers "$(jq -nc --arg a "$agent" --arg n "$idea" '{agent:$a,note:$n}')") || fail "could not get a fork"
repo=$(jq -r .repo <<<"$out") remote=$(jq -r .remote <<<"$out") token=$(jq -r ".token|@uri" <<<"$out")
# The clone's .git/config holds the repo token, so remove it however we exit.
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
git clone -q "https://x:$token@${remote#https://}" "$dir" || fail "clone of $repo failed"
cd "$dir"
$AGENT_CMD "You are improving a landing page in this directory to get more signups. Your one idea: $idea
Edit index.html only. Keep the form and its fields working. Make that one change and nothing else: no other copy, buttons, quotes or claims, even if you know other ideas." >/dev/null || fail "agent command failed on $repo"
git diff --quiet && fail "agent made no change to $repo; it stays pending and never gets traffic"
git -c user.name="$agent" -c user.email="$agent@forkarena" commit -qam "$agent: $idea"
git push -q origin HEAD:main || fail "push to $repo failed (token expired?)"
api "challengers/$repo/ready" >/dev/null || fail "ready call for $repo failed"
echo "$agent -> $repo"
