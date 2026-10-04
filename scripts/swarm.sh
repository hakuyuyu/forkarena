#!/bin/bash
# Run many agents at once against one arena. Each line of the ideas file is one agent.
# usage: scripts/swarm.sh <arena> <ideas-file>
cd "$(dirname "$0")/.."
i=0
while IFS= read -r idea; do
  [ -z "$idea" ] && continue
  i=$((i+1))
  scripts/agent.sh "$1" "agent-$i" "$idea" &
  sleep 1
done < "$2"
wait
