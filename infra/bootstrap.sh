#!/usr/bin/env bash
# WorkEspoo VPS bootstrap. Idempotent; run as root on the server from a copy
# of the infra/ directory:
#
#   scp -r infra root@2.29.206.251:/root/workespoo-infra
#   ssh root@2.29.206.251 bash /root/workespoo-infra/bootstrap.sh
#
# Generated secrets are written only to /opt/workespoo/env/.env (mode 600)
# and are never printed.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=/opt/workespoo
DOMAIN=workespoo.aichat.fi
export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

say() { printf '\n==> %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
[[ -f "$HERE/hooks/post-receive" && -f "$HERE/backup.sh" ]] || {
  echo "hooks/post-receive and backup.sh must sit next to this script" >&2; exit 1; }

# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *) echo "unsupported OS: ${ID:-unknown} (expected ubuntu or debian)" >&2; exit 1 ;;
esac

say "apt update and upgrade"
apt-get update -q
apt-get "${APT_OPTS[@]}" upgrade
apt-get "${APT_OPTS[@]}" install ca-certificates curl gnupg git ufw fail2ban python3-systemd \
  unattended-upgrades openssl

say "Docker Engine from download.docker.com"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
codename=${VERSION_CODENAME:-$(lsb_release -cs)}
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $codename stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get "${APT_OPTS[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

say "firewall (22/tcp, 80/tcp, 443/tcp, 443/udp)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable
ufw status verbose

say "fail2ban (sshd jail)"
cat > /etc/fail2ban/jail.d/workespoo-sshd.local <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban

say "unattended security upgrades (no automatic reboot)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52workespoo-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

say "swap"
mem_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
if (( mem_kb < 4 * 1024 * 1024 )); then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-workespoo-swap.conf
  sysctl -q -p /etc/sysctl.d/99-workespoo-swap.conf
  echo "RAM $((mem_kb / 1024)) MB < 4 GB: 4 GB /swapfile active"
else
  echo "RAM $((mem_kb / 1024)) MB: no swap file needed"
fi

say "timezone"
timedatectl set-timezone Europe/Helsinki

say "directories and deploy repository"
install -d -m 755 "$ROOT" "$ROOT/app" "$ROOT/state" "$ROOT/bin"
install -d -m 700 "$ROOT/env" "$ROOT/backups"
install -d -m 755 "$ROOT/repo.git"
if [[ ! -f "$ROOT/repo.git/HEAD" ]]; then
  git init -q --bare --initial-branch=main "$ROOT/repo.git"
fi
install -m 755 "$HERE/hooks/post-receive" "$ROOT/repo.git/hooks/post-receive"
install -m 755 "$HERE/backup.sh" "$ROOT/bin/backup.sh"

say "env file"
ENV_FILE=$ROOT/env/.env
if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  pg_pw=$(openssl rand -hex 24)
  {
    echo "# WorkEspoo runtime env. Mode 600. Edit, then restart: see infra/README.md"
    echo "NODE_ENV=production"
    echo "POSTGRES_USER=workespoo"
    echo "POSTGRES_DB=workespoo"
    echo "POSTGRES_PASSWORD=$pg_pw"
    echo "DATABASE_URL=postgres://workespoo:$pg_pw@db:5432/workespoo"
    echo "APP_DOMAIN=$DOMAIN"
    echo "APP_URL=https://$DOMAIN"
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
    echo "ORGANISER_PASSCODE=$(openssl rand -hex 6)"
    echo "LLM_LIVE="
    echo "LLM_ANALYST="
    echo "LLM_BULK="
    echo "NVIDIA_API_KEY="
    echo "VERDA_BASE_URL="
    echo "VERDA_API_KEY="
    echo "ELEVENLABS_API_KEY="
    echo "VOICE_ADAPTER="
  } > "$ENV_FILE"
  unset pg_pw
  echo "created $ENV_FILE (secrets generated, not shown)"
else
  echo "$ENV_FILE exists; left unchanged"
fi
chmod 600 "$ENV_FILE"

say "nightly backup timer"
cat > /etc/systemd/system/workespoo-backup.service <<EOF
[Unit]
Description=WorkEspoo nightly pg_dump
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
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
echo "deploy remote: root@$(hostname -I | awk '{print $1}'):$ROOT/repo.git"
