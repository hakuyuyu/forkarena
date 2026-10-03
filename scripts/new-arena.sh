#!/bin/bash
# Create an arena and push a seed site as its first champion.
# usage: scripts/new-arena.sh <arena> <seed-dir>   env: FA_URL, ADMIN_TOKEN
set -euo pipefail
: "${FA_URL:?set FA_URL}" "${ADMIN_TOKEN:?set ADMIN_TOKEN}"
out=$(curl -sf -X POST -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' "$FA_URL/api/arenas" -d "{\"name\":\"$1\"}")
remote=$(jq -r .remote <<<"$out") token=$(jq -r ".token|@uri" <<<"$out")
dir=$(mktemp -d)
cp -R "$2"/. "$dir"
cd "$dir"
git init -q -b main
git add -A
git -c user.name=seed -c user.email=seed@forkarena commit -qm "seed"
git push -q "https://x:$token@${remote#https://}" main
rm -rf "$dir"
echo "arena $1 live at $FA_URL/a/$1/  dashboard: $FA_URL/?arena=$1"
