#!/usr/bin/env bash
# Create a git worktree for a subagent, with dependencies ready. Lead only.
#
#   scripts/wt-new.sh <name>     # creates .claude/worktrees/<name> on branch wt/<name> from main
#
# node_modules is copied with reflinks (instant and free on btrfs, a normal copy elsewhere),
# so each worktree can run `npm run check` without installing.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
name=${1:?usage: scripts/wt-new.sh <name>}
dir=$root/.claude/worktrees/$name
branch=wt/$name

if [[ -e "$dir" ]]; then
  echo "worktree $dir already exists" >&2
  exit 1
fi
if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
  git -C "$root" worktree add -q "$dir" "$branch"
else
  git -C "$root" worktree add -q "$dir" -b "$branch" main
fi

if [[ -d "$root/node_modules" ]]; then
  cp -a --reflink=auto "$root/node_modules" "$dir/node_modules"
fi
if [[ -f "$root/.env.local" ]]; then
  cp "$root/.env.local" "$dir/.env.local"
fi

echo "$dir ($branch)"
