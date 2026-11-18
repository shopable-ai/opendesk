#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { echo 'This script is for macOS only.' >&2; exit 1; }
APP_PATH="${OPENDESK_APP:-${ROOT_DIR}/dist/OpenDesk.app}"
BIN_PATH="${APP_PATH}/Contents/MacOS/opendesk"
if [[ -n "${OPENDESK_BINARY:-}" && "${OPENDESK_BINARY}" != "${BIN_PATH}" && "${OPENDESK_BINARY}" != "${ROOT_DIR}/dist/opendesk" ]]; then
  echo 'Stable launch requires the signed App owner. Use OPENDESK_APP, not a loose OPENDESK_BINARY.' >&2
  exit 1
fi
if [[ "${REBUILD:-0}" == 1 ]]; then
  [[ "${APP_PATH}" == "${ROOT_DIR}/dist/OpenDesk.app" ]] || { echo 'REBUILD=1 only builds the repository dist app' >&2; exit 1; }
  "${ROOT_DIR}/scripts/build_macos_app.sh"
fi
source "${ROOT_DIR}/scripts/macos_signing.sh"
macos_signing_load verify
[[ -x "${BIN_PATH}" ]] || { echo "Signed app not found: ${APP_PATH}" >&2; exit 1; }
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${APP_PATH}/Contents/Info.plist")"
macos_signing_verify_app "${APP_PATH}" "${bundle_id}"
# CLI execution still has its own responsibility chain. This launcher validates
# identity; App-owned permission acceptance must use the actual running App.
exec "${BIN_PATH}" "$@"
