#!/usr/bin/env bash
# Set one variable in /opt/workespoo/env/.env, reading the VALUE FROM STDIN so
# it never appears on a command line, in `ps` or in shell history, then
# recreate web and worker so they pick it up. Installed on the server as
# /opt/workespoo/bin/set-env.sh; run it as the deploy user.
#
# From the developer machine (prompt without echo, value piped over SSH):
#   read -rsp 'value: ' v; echo; printf '%s' "$v" | ssh deploy@2.29.206.251 /opt/workespoo/bin/set-env.sh NVIDIA_API_KEY; unset v
# Or let the server prompt (no echo):
#   ssh -t deploy@2.29.206.251 /opt/workespoo/bin/set-env.sh NVIDIA_API_KEY
#
# An empty value clears the variable. The value is never printed.
set -euo pipefail

ROOT=${WORKESPOO_ROOT:-/opt/workespoo}
ENV_FILE=$ROOT/env/.env
APP=$ROOT/app

die() { echo "set-env: $*" >&2; exit 1; }

key=${1:-}
[[ $# -eq 1 && "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "usage: set-env.sh KEY   (value on stdin; KEY in UPPER_SNAKE_CASE)"
case "$key" in
  POSTGRES_PASSWORD|POSTGRES_USER|POSTGRES_DB|DATABASE_URL)
    die "$key is tied to the existing database; change it by hand (see infra/README.md)" ;;
  GIT_COMMIT)
    die "GIT_COMMIT is set by the image at build time; do not put it in the env file" ;;
esac
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE missing (run infra/bootstrap.sh)"
[[ -w "$ENV_FILE" ]] || die "cannot write $ENV_FILE (run as the deploy user)"

if [[ -t 0 ]]; then
  IFS= read -rs -p "value for $key (not echoed, Enter to finish): " value || true
  echo >&2
else
  value=$(cat)            # command substitution drops trailing newlines
fi
[[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "value must be a single line"

# Compose reads this file both as env_file and as --env-file; it interpolates
# $ in unquoted and double-quoted values. Plain values are written as is,
# anything else single-quoted (literal). A single quote cannot be represented.
if [[ "$value" =~ ^[A-Za-z0-9_./:,@+=-]*$ ]]; then
  line="$key=$value"
else
  [[ "$value" != *"'"* ]] || die "value contains a single quote, which the env file cannot hold literally"
  line="$key='$value'"
fi

# Rewrite through a temp file in the same directory (mktemp creates it 0600).
# The value reaches awk through the environment, not argv.
tmp=$(mktemp "$ENV_FILE.XXXXXX")
trap 'rm -f "$tmp"' EXIT
K="$key" L="$line" awk '
  BEGIN { k = ENVIRON["K"]; l = ENVIRON["L"]; done = 0 }
  index($0, k "=") == 1 { if (!done) { print l; done = 1 }; next }
  { print }
  END { if (!done) print l }
' "$ENV_FILE" > "$tmp"
unset value line
if [[ $EUID -eq 0 ]]; then chown --reference="$ENV_FILE" "$tmp"; fi
chmod 600 "$tmp"
mv -f "$tmp" "$ENV_FILE"
trap - EXIT
echo "set-env: $key updated in $ENV_FILE (value not shown)"

current=$(cat "$ROOT/state/current" 2>/dev/null || true)
if [[ -z "$current" || ! -f "$APP/compose.yaml" ]]; then
  echo "set-env: no deployed version recorded; nothing restarted (the next deploy reads the new value)"
  exit 0
fi
export ENV_FILE APP_TAG=$current   # compose.yaml interpolates both
dc() {
  docker compose --project-directory "$APP" -f "$APP/compose.yaml" --env-file "$ENV_FILE" "$@"
}
# up -d recreates a container whose resolved environment changed; the site
# answers 502 for the few seconds web takes to start.
dc up -d --no-build --no-deps web worker
for _ in $(seq 1 30); do
  if dc exec -T caddy wget -q -T 5 -O /dev/null http://web:3000/api/health >/dev/null 2>&1; then
    echo "set-env: web and worker recreated; web is healthy"
    exit 0
  fi
  sleep 3
done
echo "set-env: web did not become healthy within 90 s; check: docker compose logs web" >&2
exit 1
