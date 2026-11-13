#!/usr/bin/env bash
# Post-deploy smoke test, run from the developer machine.
#
#   scripts/smoke.sh                         # https://workespoo.aichat.fi
#   BASE_URL=https://host scripts/smoke.sh
#   STREAM_PATH=/api/dev/stream-test scripts/smoke.sh   # optional SSE check
#
# STREAM_PATH, if set, must be a GET endpoint that sends text/event-stream
# events spread over at least ~1 second. A 404 there is reported as a skip.
set -uo pipefail

BASE_URL=${BASE_URL:-https://workespoo.aichat.fi}
BASE_URL=${BASE_URL%/}
STREAM_PATH=${STREAM_PATH:-}
failures=0

pass() { printf 'PASS  %s\n' "$*"; }
skip() { printf 'SKIP  %s\n' "$*"; }
bad()  { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }

host=${BASE_URL#https://}; host=${host%%/*}

# 1. HTTPS with a certificate the system trust store accepts.
if out=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_URL/" 2>&1); then
  pass "HTTPS $BASE_URL/ -> $out (certificate verified)"
  if command -v openssl >/dev/null; then
    cert=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
      | openssl x509 -noout -issuer -enddate 2>/dev/null | tr '\n' ' ')
    [[ -n "$cert" ]] && printf '      %s\n' "$cert"
  fi
else
  bad "HTTPS $BASE_URL/: $out"
fi

# 2. Plain HTTP redirects to HTTPS.
code=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "http://$host/" || true)
if [[ "$code" =~ ^30[1278]\ https:// ]]; then pass "HTTP redirects to HTTPS ($code)"; else bad "HTTP redirect: got '$code'"; fi

# 3. Health endpoint.
body=$(curl -sS --max-time 15 -w '\n%{http_code}' "$BASE_URL/api/health" 2>&1)
code=${body##*$'\n'}; body=${body%$'\n'*}
if [[ "$code" == 200 ]]; then pass "/api/health -> 200 ${body:0:200}"; else bad "/api/health -> $code ${body:0:200}"; fi

# 4. Security headers that matter for the microphone and framing.
hdrs=$(curl -sS -D - -o /dev/null --max-time 15 "$BASE_URL/" 2>/dev/null | tr -d '\r')
if grep -qi '^permissions-policy:.*microphone=(self)' <<<"$hdrs"; then pass "Permissions-Policy allows microphone=(self)"; else bad "Permissions-Policy microphone=(self) missing"; fi
if grep -qi '^strict-transport-security:' <<<"$hdrs"; then pass "HSTS present"; else bad "HSTS missing"; fi

# 5. Optional: streaming is not buffered by the proxy.
if [[ -z "$STREAM_PATH" ]]; then
  skip "streaming check (set STREAM_PATH to enable)"
else
  m=$(curl -sS -N -o /dev/null --max-time 60 -H 'Accept: text/event-stream' \
        -w '%{http_code} %{time_starttransfer} %{time_total} %{content_type}' "$BASE_URL$STREAM_PATH" 2>&1)
  read -r scode ttfb total ctype <<<"$m"
  if [[ "$scode" == 404 ]]; then
    skip "streaming check: $STREAM_PATH not found"
  elif [[ "$scode" != 200 ]]; then
    bad "streaming $STREAM_PATH -> $m"
  else
    spread=$(awk -v a="$ttfb" -v b="$total" 'BEGIN { printf "%.2f", b - a }')
    if awk -v s="$spread" 'BEGIN { exit !(s >= 0.5) }'; then
      pass "streaming $STREAM_PATH: first byte ${ttfb}s, done ${total}s ($ctype)"
    else
      bad "streaming $STREAM_PATH looks buffered: first byte ${ttfb}s, done ${total}s"
    fi
  fi
fi

if (( failures > 0 )); then echo "SMOKE FAILED ($failures)"; exit 1; fi
echo "SMOKE OK"
