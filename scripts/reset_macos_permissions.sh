#!/usr/bin/env bash

set -euo pipefail

APP_BUNDLE_ID="${1:-com.opendesk.cli}"

reset_service() {
  local service="$1"
  local client="$2"
  if [[ -n "$client" ]]; then
    echo "tccutil reset ${service} ${client}"
    tccutil reset "$service" "$client" || true
    return
  fi
  echo "tccutil reset ${service}"
  tccutil reset "$service" || true
}

echo "Resetting macOS TCC permissions for ${APP_BUNDLE_ID}"

reset_service "ScreenCapture" "$APP_BUNDLE_ID"
reset_service "Accessibility" "$APP_BUNDLE_ID"
reset_service "AppleEvents" "$APP_BUNDLE_ID"

for host_id in "com.apple.Terminal" "com.googlecode.iterm2"; do
  reset_service "ScreenCapture" "$host_id"
  reset_service "Accessibility" "$host_id"
  reset_service "AppleEvents" "$host_id"
done

cat <<EOF

Done.

Notes:
- If a permission prompt showed a host such as Terminal, iTerm, or sshd-keygen-wrapper, relaunch via dist/OpenDesk.app after reset.
- For Finder launch: open dist/OpenDesk.app --args -script examples/mac/request-macos-automation-popup.js -timeout 2
- For direct binary launch: ./dist/opendesk -script examples/mac/request-macos-automation-popup.js -timeout 2
EOF
