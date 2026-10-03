#!/bin/bash
# One agent: fork the champion, try one idea, push, enter the arena.
# usage: scripts/agent.sh <arena> <agent-name> "<idea>"
# env: FA_URL (Worker URL), AGENT_TOKEN, AGENT_CMD (default: claude -p --model sonnet)
set -euo pipefail
arena=$1 agent=$2 idea=$3
: "${FA_URL:?set FA_URL}" "${AGENT_TOKEN:?set AGENT_TOKEN}"
AGENT_CMD=${AGENT_CMD:-claude -p --model sonnet}
api() {
  local body=${2:-'{}'}
  curl -sf -X POST -H "authorization: Bearer $AGENT_TOKEN" -H 'content-type: application/json' "$FA_URL/api/arenas/$arena/$1" -d "$body"
}

out=$(api challengers "$(jq -nc --arg a "$agent" --arg n "$idea" '{agent:$a,note:$n}')")
repo=$(jq -r .repo <<<"$out") remote=$(jq -r .remote <<<"$out") token=$(jq -r ".token|@uri" <<<"$out")
dir=$(mktemp -d)
git clone -q "https://x:$token@${remote#https://}" "$dir"
cd "$dir"
$AGENT_CMD "You are improving a landing page in this directory to get more signups. Your one idea: $idea
Edit index.html only. Keep the form and its fields working. Make the change, nothing else." >/dev/null
git -c user.name="$agent" -c user.email="$agent@forkarena" commit -qam "$agent: $idea"
git push -q origin HEAD:main
api "challengers/$repo/ready" >/dev/null
echo "$agent -> $repo"
rm -rf "$dir"
