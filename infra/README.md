# WorkEspoo server runbook

One VPS (`root@2.29.206.251`), one domain (`https://workespoo.aichat.fi`), Docker Compose project `workespoo` with four services: `caddy` (TLS + reverse proxy), `web` (Next.js, port 3000), `worker`, `db` (Postgres 17, not published).

| Path on the server | What |
|---|---|
| `/opt/workespoo/repo.git` | bare repo you push to; `hooks/post-receive` deploys |
| `/opt/workespoo/app` | checkout of the commit that is running |
| `/opt/workespoo/env/.env` | runtime secrets and config (mode 600, never in git) |
| `/opt/workespoo/state/current`, `previous` | image tags (12-char commit sha) |
| `/opt/workespoo/state/deploy.log` | output of every deploy |
| `/opt/workespoo/backups` | nightly `pg_dump`, newest 7 kept |
| `/opt/workespoo/bin/backup.sh` | backup script (systemd `workespoo-backup.timer`, 03:30 Helsinki) |

All `docker compose` commands below assume this alias on the server:

```bash
alias dc='docker compose --project-directory /opt/workespoo/app --env-file /opt/workespoo/env/.env'
export ENV_FILE=/opt/workespoo/env/.env APP_TAG=$(cat /opt/workespoo/state/current)
```

`APP_TAG` matters: without it compose looks for `workespoo-app:dev` and would try to build.

## Set up a fresh server

```bash
scp -r infra root@2.29.206.251:/root/workespoo-infra
ssh root@2.29.206.251 bash /root/workespoo-infra/bootstrap.sh      # idempotent, safe to re-run
```

Then fill the empty keys in `/opt/workespoo/env/.env` (see below).

## Deploy

```bash
git remote add vps root@2.29.206.251:/opt/workespoo/repo.git     # once
git push vps main
```

The hook output streams to your terminal. It: checks out the commit into `/opt/workespoo/app`, builds `workespoo-app:<sha12>`, starts `db`, runs `npm run db:migrate` in a one-off container, `up -d`, then polls `http://web:3000/api/health` from the caddy container for up to 90 s. The last line is `DEPLOY OK <sha>` or `DEPLOY FAILED <reason>`.

- Read the last line, not the exit code: git ignores a post-receive hook's exit status, so `git push` exits 0 even when the deploy failed (the commit is stored on the VPS either way).
- Build or migration failure: nothing is restarted, the old version keeps serving.
- Health failure: the previous tag is brought back up, and the push reports failure.
- Only `main` deploys; other branches are just stored. Two deploys never run at once (flock); the second one fails fast, so push again afterwards.
- Migrations are not rolled back. Keep them additive (expand, then contract in a later deploy).
- To redeploy the same commit: `git commit --allow-empty -m redeploy && git push vps main`.
- After a successful deploy the hook installs the commit's `infra/hooks/post-receive` and `infra/backup.sh` on the server, so changes to them take effect from the next push.

After a deploy run `scripts/smoke.sh` locally (`STREAM_PATH=/some/sse/test scripts/smoke.sh` to include the unbuffered-stream check).

## Logs

```bash
ssh root@2.29.206.251
dc ps
dc logs -f --tail 100 web          # or worker, caddy, db
tail -n 200 /opt/workespoo/state/deploy.log
```

Logs are rotated by Docker (10 MB x 5 per container).

## Roll back by hand

```bash
cd /opt/workespoo
docker image ls workespoo-app                 # the last five tags are kept
T=$(cat state/previous)                       # or any listed tag
GIT_INDEX_FILE=state/app.index git --git-dir=repo.git --work-tree=app read-tree --reset -u "$T"
ENV_FILE=env/.env APP_TAG=$T docker compose --project-directory app --env-file env/.env up -d --no-build
cp state/current state/previous && echo "$T" > state/current
```

The next `git push vps main` deploys normally again.

## Edit the env file and restart

```bash
ssh root@2.29.206.251
nano /opt/workespoo/env/.env
dc up -d --no-build web worker     # recreates containers so they read the new env
```

`restart` is not enough: env files are read when a container is created. Do not change `POSTGRES_PASSWORD` after the first start (the database keeps the old one); if you must, `ALTER USER` inside Postgres first. Never paste secret values into chat, commits or logs.

## Backups and restore

Run a backup now: `systemctl start workespoo-backup.service && journalctl -u workespoo-backup -n 20`. Next run: `systemctl list-timers workespoo-backup.timer`.

Restore (replaces current data):

```bash
dc stop web worker
dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < /opt/workespoo/backups/workespoo-YYYYMMDD-HHMMSS.dump
dc up -d --no-build web worker
```

Copy a dump to your machine: `scp root@2.29.206.251:/opt/workespoo/backups/<file> .` (it holds personal data; delete it when done).

## How the server is locked down

- SSH: key-only. `/etc/ssh/sshd_config.d/00-workespoo-hardening.conf` sets `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PermitRootLogin prohibit-password` (installed by `infra/ssh-lockdown.sh`, which validates with `sshd -t` before reloading). Access is through the keys in `/root/.ssh/authorized_keys`. To add someone: append their public key there. Keep an existing session open while changing SSH config and test with a new connection.
- fail2ban `sshd` jail (5 failures in 10 min = 1 h ban). `fail2ban-client status sshd`; unban with `fail2ban-client set sshd unbanip <ip>`.
- ufw: incoming deny by default; allowed 22/tcp, 80/tcp, 443/tcp, 443/udp. Note that Docker publishes ports past ufw, so never add `ports:` to `db` or `web` in `compose.yaml`; only caddy publishes 80/443.
- Unattended security upgrades are on; automatic reboot is off. Check `/var/run/reboot-required` and reboot outside demo time.
- If locked out: use the VPS provider's web console, remove the drop-in, `systemctl reload ssh`.
