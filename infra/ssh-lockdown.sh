#!/usr/bin/env bash
# Switch sshd to key-only login through a drop-in. Run as root on the server
# ONLY after key login has been verified, and keep that session open until a
# fresh connection has been confirmed from the developer machine:
#
#   ssh -o BatchMode=yes root@2.29.206.251 true
#
# Undo: rm /etc/ssh/sshd_config.d/00-workespoo-hardening.conf && systemctl reload ssh
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
[[ -s /root/.ssh/authorized_keys ]] || { echo "refusing: /root/.ssh/authorized_keys is empty" >&2; exit 1; }
grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config.d/' /etc/ssh/sshd_config || {
  echo "refusing: sshd_config does not include sshd_config.d" >&2; exit 1; }

# 00- sorts first; sshd uses the first value it sees, so this beats e.g. 50-cloud-init.conf.
DROPIN=/etc/ssh/sshd_config.d/00-workespoo-hardening.conf
cat > "$DROPIN.new" <<'EOF'
# Managed by WorkEspoo infra/ssh-lockdown.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF
mv -f "$DROPIN.new" "$DROPIN"
chmod 644 "$DROPIN"

if ! sshd -t; then
  rm -f "$DROPIN"
  echo "sshd -t failed; drop-in removed, nothing reloaded" >&2
  exit 1
fi

sshd -T 2>/dev/null | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication) '
systemctl reload ssh 2>/dev/null || systemctl reload sshd
echo "sshd reloaded; now confirm a NEW key login works before closing this session"
