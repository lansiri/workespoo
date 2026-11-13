#!/usr/bin/env bash
# Deploy main to the VPS. Lead only.
#
# git ignores a post-receive hook's exit code, so `git push` succeeds even when the
# server-side deploy fails. This wrapper reads the hook's last line instead and then
# runs the smoke test against the live site.
#
#   scripts/deploy.sh            # push main to the "vps" remote
#   scripts/deploy.sh --no-smoke # skip the smoke test
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
remote=vps
smoke=1
for arg in "$@"; do
  case "$arg" in
    --no-smoke) smoke=0 ;;
    *) remote=$arg ;;
  esac
done

if ! git -C "$root" remote get-url "$remote" >/dev/null 2>&1; then
  echo "remote '$remote' is not configured. Add it once with:" >&2
  echo "  git remote add vps deploy@2.29.206.251:/opt/workespoo/repo.git" >&2
  exit 2
fi

if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
  echo "warning: uncommitted changes are not part of this deploy" >&2
fi

out=$(mktemp)
trap 'rm -f "$out"' EXIT

git -C "$root" push "$remote" main 2>&1 | tee "$out"

if grep -q 'DEPLOY OK' "$out"; then
  echo "deploy reported OK"
elif grep -q 'Everything up-to-date' "$out"; then
  echo "nothing new to deploy"
else
  echo "the server did not report DEPLOY OK; see the output above" >&2
  exit 1
fi

if [[ $smoke -eq 1 && -x "$root/scripts/smoke.sh" ]]; then
  "$root/scripts/smoke.sh"
fi
