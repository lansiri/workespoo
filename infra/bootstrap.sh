#!/usr/bin/env bash
# WorkEspoo VPS bootstrap. Idempotent and safe to re-run; run as root on the
# server from a copy of the infra/ directory plus the repo's .env.example:
#
#   scp -r infra .env.example root@2.29.206.251:/root/workespoo-infra/
#   ssh root@2.29.206.251 bash /root/workespoo-infra/infra/bootstrap.sh
#
# This script never touches sshd. SSH hardening is a separate, explicitly
# invoked step (infra/ssh-lockdown.sh) because it is the one change that can
# lock you out.
#
# Generated secrets are written only to /opt/workespoo/env/.env (mode 600,
# owner deploy) and are never printed.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=/opt/workespoo
DOMAIN=workespoo.aichat.fi
DEPLOY_USER=deploy
export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

say() { printf '\n==> %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
for f in hooks/post-receive backup.sh set-env.sh; do
  [[ -f "$HERE/$f" ]] || { echo "$f must sit next to this script" >&2; exit 1; }
done
# .env.example: next to infra/ (scp layout above) or inside it.
ENV_EXAMPLE=""
for c in "$HERE/../.env.example" "$HERE/.env.example"; do
  [[ -f "$c" ]] && { ENV_EXAMPLE=$c; break; }
done

# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || { echo "unsupported OS: ${ID:-unknown} (expected ubuntu)" >&2; exit 1; }

# ---------------------------------------------------------------- 1. patches
say "apt update and full upgrade"
apt-get update -q
apt-get "${APT_OPTS[@]}" full-upgrade
apt-get "${APT_OPTS[@]}" install ca-certificates curl gnupg git ufw fail2ban python3-systemd \
  unattended-upgrades openssl
if [[ -f /var/run/reboot-required ]]; then
  echo "NOTE: a reboot is required ($(tr '\n' ' ' < /var/run/reboot-required.pkgs 2>/dev/null))."
  echo "      Reboot when nothing important is running, then re-run this script."
fi

# ------------------------------------------------------------ 9. sysctl, swap
say "kernel network settings"
cat > /etc/sysctl.d/90-workespoo-net.conf <<'EOF'
# Managed by WorkEspoo infra/bootstrap.sh
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
EOF

say "swap (4 GB /swapfile, swappiness 10)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness = 10' > /etc/sysctl.d/90-workespoo-swap.conf
sysctl -q --system
swapon --show

# ----------------------------------------------------------- 12. housekeeping
say "timezone and journald cap"
timedatectl set-timezone Europe/Helsinki
install -d -m 755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/50-workespoo.conf <<'EOF'
# Managed by WorkEspoo infra/bootstrap.sh
[Journal]
SystemMaxUse=500M
EOF
systemctl restart systemd-journald

# ------------------------------------------------------------------ 8. Docker
say "Docker Engine from download.docker.com"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
rm -f /etc/apt/sources.list.d/docker.list
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update -q
apt-get "${APT_OPTS[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

install -d -m 755 /etc/docker
cat > /etc/docker/daemon.json.new <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
EOF
if ! cmp -s /etc/docker/daemon.json.new /etc/docker/daemon.json; then
  mv -f /etc/docker/daemon.json.new /etc/docker/daemon.json
  systemctl enable docker >/dev/null 2>&1
  # live-restore keeps running containers up across this restart once it is active.
  systemctl restart docker
else
  rm -f /etc/docker/daemon.json.new
fi
systemctl enable --now docker >/dev/null 2>&1

# ------------------------------------------------------------ 2. deploy user
say "deploy user"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --user-group "$DEPLOY_USER"
fi
passwd -l "$DEPLOY_USER" >/dev/null           # locked password: key login only
for g in sudo admin wheel; do                  # never a sudoer
  if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx "$g"; then gpasswd -d "$DEPLOY_USER" "$g" >/dev/null; fi
done
usermod -aG docker "$DEPLOY_USER"              # root-equivalent on this host; see infra/README.md
dhome=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dhome/.ssh"
if [[ ! -s "$dhome/.ssh/authorized_keys" ]]; then
  [[ -s /root/.ssh/authorized_keys ]] || { echo "root has no authorized_keys to copy" >&2; exit 1; }
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "$dhome/.ssh/authorized_keys"
  echo "copied root's authorized_keys to $DEPLOY_USER"
else
  echo "$dhome/.ssh/authorized_keys exists; left unchanged"
fi

# -------------------------------------------------------------- 4. firewall
say "firewall: deny in, allow out; 22/tcp limited, 80/tcp, 443/tcp, 443/udp"
sed -i 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw delete allow 22/tcp >/dev/null 2>&1 || true   # older bootstrap used allow, not limit
ufw limit 22/tcp comment 'ssh (rate-limited)' >/dev/null
ufw allow 80/tcp comment 'http (caddy)' >/dev/null
ufw allow 443/tcp comment 'https (caddy)' >/dev/null
ufw allow 443/udp comment 'http/3 (caddy)' >/dev/null
ufw --force enable >/dev/null
ufw status verbose

# --------------------------------------------------------------- 5. fail2ban
say "fail2ban (sshd jail, systemd backend)"
cat > /etc/fail2ban/jail.d/workespoo-sshd.local <<'EOF'
# Managed by WorkEspoo infra/bootstrap.sh
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd | sed -n '1,4p'

# ----------------------------------------------------- 6. unattended upgrades
say "unattended security upgrades (automatic reboot off)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52workespoo-unattended <<'EOF'
// Managed by WorkEspoo infra/bootstrap.sh. A reboot during the demo would be
// worse than a pending one: check /var/run/reboot-required and reboot by hand.
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# ------------------------------------------- directories and deploy repository
say "directories and deploy repository (owner $DEPLOY_USER)"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ROOT" "$ROOT/app" "$ROOT/state" "$ROOT/bin" "$ROOT/repo.git"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ROOT/env" "$ROOT/backups"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$ROOT"
if [[ ! -f "$ROOT/repo.git/HEAD" ]]; then
  runuser -u "$DEPLOY_USER" -- git init -q --bare --initial-branch=main "$ROOT/repo.git"
fi
install -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HERE/hooks/post-receive" "$ROOT/repo.git/hooks/post-receive"
install -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HERE/backup.sh" "$ROOT/bin/backup.sh"
install -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HERE/set-env.sh" "$ROOT/bin/set-env.sh"

# -------------------------------------------------------------- 10. env file
say "env file"
ENV_FILE=$ROOT/env/.env
if [[ ! -f "$ENV_FILE" ]]; then
  (
    umask 077
    pg_pw=$(openssl rand -hex 24)
    {
      echo "# WorkEspoo runtime env. Mode 600, owner $DEPLOY_USER, never in git."
      echo "# Set one value: infra/set-env.sh KEY (reads the value from stdin). See infra/README.md."
      echo "NODE_ENV=production"
      echo "POSTGRES_USER=workespoo"
      echo "POSTGRES_DB=workespoo"
      echo "POSTGRES_PASSWORD=$pg_pw"
      echo "DATABASE_URL=postgres://workespoo:$pg_pw@db:5432/workespoo"
      echo "APP_DOMAIN=$DOMAIN"
      echo "APP_URL=https://$DOMAIN"
      echo "SESSION_SECRET=$(openssl rand -hex 32)"
      echo "ORGANISER_PASSCODE=$(openssl rand -hex 6)"
    } > "$ENV_FILE"
  )
  echo "created $ENV_FILE (secrets generated, not shown)"
else
  echo "$ENV_FILE exists; existing values left unchanged"
fi
# Placeholders: every key in .env.example that the file lacks is appended
# empty. GIT_COMMIT is skipped on purpose: the image sets it at build time and
# an empty env_file value would override it.
if [[ -n "$ENV_EXAMPLE" ]]; then
  added=0
  while IFS= read -r key; do
    [[ "$key" == GIT_COMMIT ]] && continue
    grep -q "^${key}=" "$ENV_FILE" || { echo "${key}=" >> "$ENV_FILE"; added=$((added + 1)); }
  done < <(grep -oE '^[A-Z][A-Z0-9_]*=' "$ENV_EXAMPLE" | tr -d '=')
  echo "placeholders from .env.example: $added added"
else
  echo "WARNING: .env.example not found next to infra/; placeholders not added"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ------------------------------------------------------ 12. nightly backup
say "nightly backup timer (03:30 Europe/Helsinki, newest 7 kept)"
cat > /etc/systemd/system/workespoo-backup.service <<EOF
[Unit]
Description=WorkEspoo nightly pg_dump
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$DEPLOY_USER
Group=$DEPLOY_USER
ExecStart=$ROOT/bin/backup.sh
EOF
cat > /etc/systemd/system/workespoo-backup.timer <<'EOF'
[Unit]
Description=Run WorkEspoo backup nightly

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now workespoo-backup.timer >/dev/null 2>&1

say "done"
docker --version
docker compose version
echo "deploy remote: $DEPLOY_USER@$(hostname -I | awk '{print $1}'):$ROOT/repo.git"
echo "SSH hardening is NOT applied by this script: run infra/ssh-lockdown.sh separately."
