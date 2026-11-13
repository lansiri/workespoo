#!/usr/bin/env bash
# SSH hardening for the WorkEspoo VPS, through one drop-in that sorts before
# cloud-init's 50-cloud-init.conf (sshd keeps the FIRST value it reads).
# Deliberately separate from bootstrap.sh: this is the step that can lock you
# out. Run it as root on the server AFTER bootstrap.sh (the deploy user must
# exist with a key), from a session you keep open:
#
#   ssh root@2.29.206.251 bash /root/workespoo-infra/infra/ssh-lockdown.sh
#
# Then, from the developer machine and before closing that session, confirm
# NEW connections for both users and that passwords are refused:
#
#   ssh -o ControlPath=none root@2.29.206.251 true
#   ssh -o ControlPath=none deploy@2.29.206.251 true
#   ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password \
#       -o BatchMode=yes root@2.29.206.251 true      # must fail: "Permission denied (publickey)"
#
# Undo (from the open session or the provider's web console):
#   bash ssh-lockdown.sh --undo
set -euo pipefail

DROPIN=/etc/ssh/sshd_config.d/00-workespoo-hardening.conf
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }

reload_sshd() { systemctl reload ssh 2>/dev/null || systemctl reload sshd; }

if [[ "${1:-}" == --undo ]]; then
  rm -f "$DROPIN"
  sshd -t && reload_sshd
  echo "drop-in removed; sshd reloaded with the previous settings"
  exit 0
fi

# Refuse anything that could leave no way in.
[[ -s /root/.ssh/authorized_keys ]] || { echo "refusing: /root/.ssh/authorized_keys is empty" >&2; exit 1; }
id deploy >/dev/null 2>&1 || { echo "refusing: user deploy missing (run bootstrap.sh first)" >&2; exit 1; }
dhome=$(getent passwd deploy | cut -d: -f6)
[[ -s "$dhome/.ssh/authorized_keys" ]] || { echo "refusing: $dhome/.ssh/authorized_keys is empty" >&2; exit 1; }
grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config.d/' /etc/ssh/sshd_config || {
  echo "refusing: sshd_config does not include sshd_config.d" >&2; exit 1; }

cat > "$DROPIN.new" <<'EOF'
# Managed by WorkEspoo infra/ssh-lockdown.sh. 00- sorts before 50-cloud-init.conf;
# sshd uses the first value it reads, so these win.
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
AllowUsers root deploy
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
chmod 644 "$DROPIN.new"
mv -f "$DROPIN.new" "$DROPIN"

if ! sshd -t; then
  rm -f "$DROPIN"
  echo "sshd -t failed; drop-in removed, nothing reloaded" >&2
  exit 1
fi

# Check the effective configuration before reloading.
want='passwordauthentication no
kbdinteractiveauthentication no
pubkeyauthentication yes
allowusers root
allowusers deploy
maxauthtries 3
logingracetime 30
x11forwarding no
clientaliveinterval 300
clientalivecountmax 2'
eff=$(sshd -T 2>/dev/null)
missing=0
while IFS= read -r line; do
  grep -qxF "$line" <<<"$eff" || { echo "effective config lacks: $line" >&2; missing=1; }
done <<<"$want"
# OpenSSH prints prohibit-password (older releases: without-password).
grep -qxE 'permitrootlogin (prohibit-password|without-password)' <<<"$eff" || {
  echo "effective config lacks: permitrootlogin prohibit-password" >&2; missing=1; }
if (( missing )); then
  rm -f "$DROPIN"
  echo "effective config is not what the drop-in asks for; drop-in removed, nothing reloaded" >&2
  exit 1
fi

reload_sshd
echo "sshd reloaded. Existing sessions are unaffected."
echo "NOW confirm new key logins for root and deploy from another terminal before closing this one."
echo "If either fails: bash $0 --undo"
