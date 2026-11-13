# WorkEspoo server runbook

One VPS (`hel-j26-workespoo`, 2.29.206.251, Ubuntu 26.04 LTS, 2 vCPU, 3.7 GiB RAM + 4 GiB swap), one domain (`https://workespoo.aichat.fi`, A record only; no AAAA, no CAA), Docker Compose project `workespoo` with four services: `caddy` (TLS + reverse proxy, the only thing that publishes ports), `web` (Next.js, port 3000 inside the network), `worker`, `db` (Postgres 17, not published).

Two SSH users, both key-only:

| User | Use it for |
|---|---|
| `deploy` | `git push`, logs, `docker compose`, `set-env.sh`, backups. Unprivileged, locked password, no sudo, member of `docker`. Owns everything under `/opt/workespoo`. |
| `root` | Administration only: packages, firewall, sshd, reboots. |

**The docker group is root-equivalent.** Anyone who can log in as `deploy` can start a container that mounts `/` and become root on the host. The separate user keeps day-to-day work and the deploy hook out of a root shell and makes mistakes smaller; it is not a security boundary against someone holding the deploy key. Guard that key like root's.

| Path on the server | What |
|---|---|
| `/opt/workespoo/repo.git` | bare repo you push to; `hooks/post-receive` deploys |
| `/opt/workespoo/app` | checkout of the commit that is running |
| `/opt/workespoo/env/.env` | runtime secrets and config (mode 600, owner deploy, never in git) |
| `/opt/workespoo/state/current`, `previous` | image tags (12-char commit sha) of the running and the last good version |
| `/opt/workespoo/state/deploy.log` | output of every deploy |
| `/opt/workespoo/backups` | nightly `pg_dump`, newest 7 kept |
| `/opt/workespoo/bin/backup.sh` | backup script (systemd `workespoo-backup.timer`, 03:30 Helsinki, runs as deploy) |
| `/opt/workespoo/bin/set-env.sh` | set one env variable from stdin and restart web + worker |

All `docker compose` commands below assume this alias in the deploy user's shell:

```bash
alias dc='ENV_FILE=/opt/workespoo/env/.env APP_TAG=$(cat /opt/workespoo/state/current) docker compose --project-directory /opt/workespoo/app --env-file /opt/workespoo/env/.env'
```

`APP_TAG` matters: without it compose looks for `workespoo-app:dev` and would try to build.

## Deploy

```bash
git remote add vps deploy@2.29.206.251:/opt/workespoo/repo.git     # once
scripts/deploy.sh                                                  # = git push vps main + smoke test
```

The hook output streams to your terminal. It checks out the commit into `/opt/workespoo/app`, builds `workespoo-app:<sha12>` while the old version keeps serving, starts `db`, runs `npm run db:migrate` in a one-off container, `up -d`, then polls `http://web:3000/api/health` from the caddy container for up to 90 s. The last line is `DEPLOY OK <sha>` or `DEPLOY FAILED <reason>`.

- Read the last line, not the exit code: git ignores a post-receive hook's exit status, so `git push` exits 0 even when the deploy failed (the commit is stored on the VPS either way). `scripts/deploy.sh` reads the line for you.
- Build or migration failure: nothing is restarted, the old version keeps serving (verified: a build failing after 25 s, the site answered 200 throughout).
- Health failure: the previous tag is brought back up and the hook prints `DEPLOY FAILED ... (rolled back to <tag>)`. The very first deploy has no previous version, so a failed first deploy stays down until you push a fix.
- Only `main` deploys; other branches are just stored. Two deploys never run at once (flock); the second fails fast, so push again afterwards.
- Migrations are not rolled back. Keep them additive (expand, then contract in a later deploy).
- To redeploy the same commit: `git commit --allow-empty -m redeploy && git push vps main`.
- After a successful deploy the hook installs the commit's `infra/hooks/post-receive`, `infra/backup.sh` and `infra/set-env.sh` on the server, so changes to them take effect from the next push.
- `next build` on 2 vCPU / 3.7 GiB is slow and memory-hungry. It runs inside dockerd, outside the containers' memory limits; swap absorbs the peak, and `db`, `web` and `caddy` have a negative `oom_score_adj` so the kernel kills the build or the worker first if memory still runs out.

After a deploy, `scripts/smoke.sh` checks HTTPS, the redirect, health, HSTS and the microphone policy (`STREAM_PATH=/some/sse/endpoint scripts/smoke.sh` adds the unbuffered-stream check).

## Secrets and config: set-env.sh

Set one variable without the value ever appearing in a command line, `ps` or shell history:

```bash
read -rsp 'value: ' v; echo; printf '%s' "$v" | ssh deploy@2.29.206.251 /opt/workespoo/bin/set-env.sh NVIDIA_API_KEY; unset v
# or let the server prompt without echo:
ssh -t deploy@2.29.206.251 /opt/workespoo/bin/set-env.sh NVIDIA_API_KEY
```

It rewrites the line in `/opt/workespoo/env/.env` (mode stays 600), then recreates `web` and `worker` and waits until web is healthy (the site answers 502 for the few seconds web takes to start). An empty value clears the variable. Values with characters other than `A-Za-z0-9_./:,@+=-` are stored single-quoted so Compose does not interpolate `$`; a value containing a single quote is refused. If nothing is deployed yet it only edits the file.

`POSTGRES_*` and `DATABASE_URL` are refused: the database keeps the password it was created with. To change it, `ALTER USER` inside Postgres first, then edit the file by hand as deploy and run `dc up -d --no-build`.

`POSTGRES_PASSWORD`, `SESSION_SECRET` and `ORGANISER_PASSCODE` were generated on the server by `bootstrap.sh` and have never left it. To read the organiser passcode: `ssh deploy@2.29.206.251 grep ^ORGANISER_PASSCODE= /opt/workespoo/env/.env`. Never paste secret values into chat, commits or logs.

## Logs

```bash
ssh deploy@2.29.206.251
dc ps
dc logs -f --tail 100 web          # or worker, caddy, db
tail -n 200 /opt/workespoo/state/deploy.log
docker stats --no-stream           # memory per container against its limit
```

Container logs are rotated by Docker (`/etc/docker/daemon.json`: json-file, 10 MB x 5). journald is capped at 500 MB.

## Roll back by hand

```bash
ssh deploy@2.29.206.251
cd /opt/workespoo
docker image ls workespoo-app                 # the last five tags are kept
T=$(cat state/previous)                       # or any listed tag
GIT_INDEX_FILE=state/app.index git --git-dir=repo.git --work-tree=app read-tree --reset -u "$T"
ENV_FILE=env/.env APP_TAG=$T docker compose --project-directory app --env-file env/.env up -d --no-build
cp state/current state/previous && echo "$T" > state/current
```

The next `git push vps main` deploys normally again.

## Backups and restore

Run a backup now: `ssh root@2.29.206.251 'systemctl start workespoo-backup.service && journalctl -u workespoo-backup -n 5'`. Next run: `systemctl list-timers workespoo-backup.timer`.

Restore (replaces current data), as deploy:

```bash
dc stop web worker
dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < /opt/workespoo/backups/workespoo-YYYYMMDD-HHMMSS.dump
dc up -d --no-build web worker
```

**The backups are on the same disk as the database.** They protect against a bad migration or a mistaken delete, not against losing the VPS. An off-site copy would need: a target in the EU (e.g. a Hetzner Storage Box or an S3-compatible bucket), client-side encryption with a key kept off the server (restic or age), credentials for that target stored on the server (mode 600, owner deploy), one more step in `backup.sh` after `pg_dump` (`restic backup` or `rclone copy`) with its own retention, and a restore actually tested from the off-site copy. The dumps contain personal data, so the target and its retention must match the 24-hour purge promise for live demo sessions. Not set up.

Copy a dump to your machine: `scp deploy@2.29.206.251:/opt/workespoo/backups/<file> .` (it holds personal data; delete it when done).

## TLS

Caddy obtains and renews the Let's Encrypt certificate for `workespoo.aichat.fi` by itself (HTTP-01 / TLS-ALPN-01 on 80/443). No ACME contact email is configured, so Let's Encrypt sends no expiry warnings; Caddy renews about 30 days before expiry. Check: `echo | openssl s_client -connect workespoo.aichat.fi:443 -servername workespoo.aichat.fi 2>/dev/null | openssl x509 -noout -issuer -enddate`.

The certificate and ACME account live in the `workespoo_caddy-data` volume, which survives redeploys and reboots. **Never run `docker compose down -v` or remove that volume.** Each wipe makes Caddy request a new certificate, and Let's Encrypt allows only 5 certificates for the same exact name per 7 days (and 50 per week for all of `aichat.fi`, shared with other subdomains), plus 5 failed validations per hostname per hour. After a handful of wipes the site would have no valid certificate, so no HTTPS and no microphone, until the 7-day window rolls over. With no email configured, do not count on a fallback CA.

Caddy settings in `Caddyfile`: HTTP to HTTPS redirect (308), HSTS `max-age=31536000` without `includeSubDomains`, HTTP/3 (443/udp), zstd/gzip only for listed text types (never `text/event-stream`), `flush_interval -1` so server-sent events are never buffered.

## How the server is set up

Everything below is applied by `infra/bootstrap.sh` (idempotent; re-running it on the live server leaves the env file and the running stack alone) except SSH hardening, which is the separate `infra/ssh-lockdown.sh`.

- **Patches:** full upgrade at setup. Unattended security upgrades are on; **automatic reboot is off** (a reboot during the demo would be worse than a pending one). Check for a pending reboot: `ssh root@2.29.206.251 'cat /var/run/reboot-required /var/run/reboot-required.pkgs 2>/dev/null || echo no reboot pending'`. Reboot outside demo time; the stack, firewall, fail2ban and swap all come back by themselves (verified).
- **SSH:** `/etc/ssh/sshd_config.d/00-workespoo-hardening.conf` (sorts before `50-cloud-init.conf`; sshd keeps the first value): pubkey only, no password or keyboard-interactive, `PermitRootLogin prohibit-password`, `AllowUsers root deploy`, `MaxAuthTries 3`, `LoginGraceTime 30`, `X11Forwarding no`, `ClientAliveInterval 300` / `ClientAliveCountMax 2`. To add a person: append their public key to `/home/deploy/.ssh/authorized_keys` (and root's only if they administer the host). Keep an existing session open while changing SSH config and test with a new connection; undo with `bash ssh-lockdown.sh --undo`.
- **Firewall (ufw, IPv4 and IPv6):** deny incoming, allow outgoing; `22/tcp` rate-limited (`ufw limit`: 6 new connections in 30 s from one address are dropped, so use `ControlMaster` for scripted SSH), `80/tcp`, `443/tcp`, `443/udp`. Docker publishes ports past ufw, so **never add `ports:` to `db`, `web` or `worker`**; only caddy publishes 80/443. Check from outside: `nc -zv -w5 2.29.206.251 5432` and `3000` must fail.
- **fail2ban:** `sshd` jail on the systemd backend, 5 failures in 10 min = 1 h ban. `fail2ban-client status sshd`; unban with `fail2ban-client set sshd unbanip <ip>`.
- **Swap:** 4 GB `/swapfile` in `/etc/fstab`, `vm.swappiness = 10`.
- **Kernel (`/etc/sysctl.d/90-workespoo-net.conf`):** strict reverse-path filtering, no ICMP redirects (accept, secure or send), no source routing (v4 and v6), SYN cookies.
- **Docker:** from download.docker.com. `/etc/docker/daemon.json`: json-file logs 10 MB x 5, `live-restore` (containers keep running while dockerd restarts or upgrades).
- **Containers (`compose.yaml`):** web and worker run as the image's `node` user with `cap_drop: [ALL]`, `no-new-privileges`, `init: true` (tini as PID 1); not read-only, because Next.js writes `.next/cache`. Caddy drops all capabilities except `NET_BIND_SERVICE` and has `no-new-privileges`; it runs as root inside the container because it owns `/data` (certificates) and `/config`. Memory ceilings: db 1 GB, web 1 GB, worker 768 MB, caddy 256 MB; `oom_score_adj` db -800, web and caddy -500.
- **Housekeeping:** timezone Europe/Helsinki, journald capped at 500 MB, nightly backup timer.

## Set up a fresh server

```bash
scp -r infra .env.example root@<ip>:/root/workespoo-infra/
ssh root@<ip> bash /root/workespoo-infra/infra/bootstrap.sh
# If it prints "a reboot is required": reboot, wait for SSH, run it again.
ssh root@<ip> bash /root/workespoo-infra/infra/ssh-lockdown.sh     # keep this session open
ssh root@<ip> true && ssh deploy@<ip> true                        # NEW connections must work
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password -o BatchMode=yes root@<ip> true  # must fail
```

Then set the empty keys with `set-env.sh` and push.

If locked out: use the VPS provider's web console, `rm /etc/ssh/sshd_config.d/00-workespoo-hardening.conf && systemctl reload ssh` (and `ufw disable` if the firewall is the problem).
