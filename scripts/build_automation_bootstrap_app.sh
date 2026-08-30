#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${ROOT_DIR}/artifacts/macos-permission-bootstrap/Clawdesk Automation.app"
SCRIPT_FILE="${ROOT_DIR}/artifacts/macos-permission-bootstrap/automation-bootstrap.applescript"
PLIST_PATH="${APP_ROOT}/Contents/Info.plist"

mkdir -p "$(dirname "${SCRIPT_FILE}")"
rm -rf "${APP_ROOT}"

cat > "${SCRIPT_FILE}" <<'EOF'
on run argv
  set targetApp to "System Events"
  if (count of argv) > 0 then
    set targetApp to item 1 of argv
  end if

  if targetApp is "System Events" then
    tell application "System Events" to get name of every process
  else if targetApp is "Finder" then
    tell application "Finder" to get name of startup disk
  else
    tell application targetApp to activate
  end if

  delay 30
end run
EOF

osacompile -o "${APP_ROOT}" "${SCRIPT_FILE}"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIdentifier string com.clawdesk.cli' "${PLIST_PATH}" || /usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.clawdesk.cli' "${PLIST_PATH}"
/usr/libexec/PlistBuddy -c 'Add :CFBundleDisplayName string Clawdesk' "${PLIST_PATH}" || /usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Clawdesk' "${PLIST_PATH}"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName Clawdesk' "${PLIST_PATH}" || true
codesign --force --deep --sign - "${APP_ROOT}" >/dev/null

printf 'Built automation helper app: %s\n' "${APP_ROOT}"
printf 'Launch with: open -n "%s" --args "System Events"\n' "${APP_ROOT}"
