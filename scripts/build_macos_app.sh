#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
APP_ROOT="${DIST_DIR}/Clawdesk.app"
CONTENTS_DIR="${APP_ROOT}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
EXECUTABLE_PATH="${MACOS_DIR}/clawdesk"
PLIST_PATH="${CONTENTS_DIR}/Info.plist"
BUNDLE_ID="${BUNDLE_ID:-com.clawdesk.cli}"
APP_NAME="${APP_NAME:-Clawdesk}"
VERSION="${VERSION:-0.1.0}"
CODESIGN_IDENTITY="${CODESIGN_IDENTITY:--}"

mkdir -p "${DIST_DIR}"

go build -o "${DIST_DIR}/clawdesk" ./cmd/clawdesk

rm -rf "${APP_ROOT}"
mkdir -p "${MACOS_DIR}"

cp "${DIST_DIR}/clawdesk" "${EXECUTABLE_PATH}"
rsync -a --delete "${ROOT_DIR}/polyfills/" "${MACOS_DIR}/polyfills/"
rsync -a --delete "${ROOT_DIR}/jslibs/" "${MACOS_DIR}/jslibs/"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>clawdesk</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>Clawdesk needs Automation permission to control System Events and target applications for desktop automation workflows.</string>
</dict>
</plist>
EOF

if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  echo "Skipping codesign because SKIP_CODESIGN=1"
else
  codesign --force --deep --sign "${CODESIGN_IDENTITY}" "${APP_ROOT}" >/dev/null
fi

printf 'Built binary: %s\n' "${DIST_DIR}/clawdesk"
printf 'Built app: %s\n' "${APP_ROOT}"
printf 'Bundle id: %s\n' "${BUNDLE_ID}"
if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  printf 'Codesign: skipped\n'
else
  printf 'Codesign identity: %s\n' "${CODESIGN_IDENTITY}"
fi
printf 'Launch with: open "%s"\n' "${APP_ROOT}"
