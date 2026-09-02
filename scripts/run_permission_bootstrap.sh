#!/usr/bin/env bash

set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || {
  printf 'This script is for macOS only.\n' >&2
  exit 1
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_APP="${1:-System Events}"
KEEPALIVE="${KEEPALIVE:-90s}"
BOOTSTRAP_ROOT="${ROOT_DIR}/.runtime/bootstrap/macos-permission-bootstrap"
SCREEN_APP="${BOOTSTRAP_ROOT}/OpenDesk.app"
AUTOMATION_APP="${BOOTSTRAP_ROOT}/OpenDesk Automation.app"
TEMP_LOG_DIR="$(getconf DARWIN_USER_TEMP_DIR)"

"${ROOT_DIR}/scripts/build_permission_bootstrap_app.sh" >/dev/null
"${ROOT_DIR}/scripts/build_automation_bootstrap_app.sh" >/dev/null

open -n "${SCREEN_APP}" --args -mode all -keepalive "${KEEPALIVE}"
sleep 1
open -n "${AUTOMATION_APP}" --args "${TARGET_APP}"

cat <<EOF
Launched macOS permission bootstrap apps.

Screen/settings helper:
  ${SCREEN_APP}

Automation helper:
  ${AUTOMATION_APP}

Target automation app:
  ${TARGET_APP}

Helper log:
  ${TEMP_LOG_DIR}opendesk-permission-bootstrap.log
EOF
