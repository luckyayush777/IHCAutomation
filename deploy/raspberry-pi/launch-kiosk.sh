#!/usr/bin/env bash
set -euo pipefail

console_url="http://127.0.0.1:4000"

for _attempt in $(seq 1 60); do
  if curl --fail --silent --output /dev/null "${console_url}/health"; then
    break
  fi
  sleep 2
done

if command -v chromium >/dev/null 2>&1; then
  browser="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
  browser="chromium-browser"
else
  echo "Chromium is required for kiosk mode." >&2
  exit 1
fi

exec "${browser}" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  "${console_url}"
