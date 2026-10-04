#!/bin/bash
# Run many agents at once against one arena. Each line of the ideas file is one agent.
# usage: scripts/swarm.sh <arena> <ideas-file>
cd "$(dirname "$0")/.."
i=0 pids=()
while IFS= read -r idea; do
  [ -z "$idea" ] && continue
  i=$((i+1))
  scripts/agent.sh "$1" "agent-$i" "$idea" &
  pids+=($!)
  sleep 1
done < "$2"
failed=0
for p in "${pids[@]}"; do wait "$p" || failed=$((failed+1)); done
[ "$failed" -eq 0 ] || { echo "$failed of $i agents failed" >&2; exit 1; }
