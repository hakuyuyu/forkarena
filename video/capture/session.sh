#!/bin/bash
# Runs the live demo session end to end and logs every command and output line with a timestamp.
# usage: capture/session.sh <arena> <outdir> <phase>   phase: create | swarm | traffic <n> | agent <name> "<idea>"
# env: FA_URL, ADMIN_TOKEN, AGENT_TOKEN
set -uo pipefail
arena=$1 out=$(cd "$2" && pwd) phase=$3
cd "$(dirname "$0")/../.."
log="$out/transcript.tsv"
stamp() { perl -MTime::HiRes=time -ne '$|=1; chomp; printf "%.3f\tout\t%s\n", time, $_' >>"$log"; }
note() { perl -MTime::HiRes=time -e 'printf "%.3f\tcmd\t%s\n", time, $ARGV[0]' "$1" >>"$log"; }
case $phase in
  create)  note "scripts/new-arena.sh $arena seed"; scripts/new-arena.sh "$arena" seed 2>&1 | stamp ;;
  swarm)   note "scripts/swarm.sh $arena ideas.txt"; scripts/swarm.sh "$arena" ideas.txt 2>&1 | stamp ;;
  traffic) n=$4; note "node scripts/simulate.mjs $arena $n   # x4 in parallel"
           for i in 1 2 3 4; do node scripts/simulate.mjs "$arena" $((n/4)) 2>&1 | sed "s/^/[sim$i] /" | stamp & done; wait ;;
  agent)   note "scripts/agent.sh $arena $4 \"$5\""; scripts/agent.sh "$arena" "$4" "$5" 2>&1 | stamp ;;
esac
