#!/usr/bin/env bash
# Nightly Postgres dump for WorkEspoo. Installed to /opt/workespoo/bin/backup.sh
# and run by workespoo-backup.timer. Keeps the newest $KEEP dumps.
set -euo pipefail

ROOT=/opt/workespoo
APP=$ROOT/app
ENV_FILE=$ROOT/env/.env
DEST=$ROOT/backups
KEEP=${KEEP:-7}

mkdir -p "$DEST"
chmod 700 "$DEST"

if ! docker compose --project-directory "$APP" -f "$APP/compose.yaml" --env-file "$ENV_FILE" ps --status running db | grep -q db; then
  echo "backup: db container is not running; skipping" >&2
  exit 1
fi

stamp=$(date '+%Y%m%d-%H%M%S')
out=$DEST/workespoo-$stamp.dump
tmp=$out.partial

# pg_dump runs inside the db container as the configured superuser; the
# custom format (-Fc) is compressed and restorable with pg_restore.
docker compose --project-directory "$APP" -f "$APP/compose.yaml" --env-file "$ENV_FILE" \
  exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"
[[ -s "$tmp" ]] || { rm -f "$tmp"; echo "backup: empty dump" >&2; exit 1; }
chmod 600 "$tmp"
mv "$tmp" "$out"
echo "backup: wrote $out ($(du -h "$out" | cut -f1))"

# Retention: newest $KEEP only.
find "$DEST" -maxdepth 1 -name 'workespoo-*.dump' -printf '%T@ %p\n' | sort -rn \
  | tail -n +$((KEEP + 1)) | cut -d' ' -f2- | while read -r old; do
      rm -f -- "$old" && echo "backup: removed $old"
    done
