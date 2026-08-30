#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_APP="${1:-System Events}"
KEEPALIVE="${KEEPALIVE:-90s}"
SCREEN_APP="${ROOT_DIR}/artifacts/macos-permission-bootstrap/Clawdesk.app"
AUTOMATION_APP="${ROOT_DIR}/artifacts/macos-permission-bootstrap/Clawdesk Automation.app"
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
  ${TEMP_LOG_DIR}clawdesk-permission-bootstrap.log
EOF
