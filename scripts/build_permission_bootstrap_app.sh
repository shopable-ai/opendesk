#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP_ROOT="${ROOT_DIR}/.runtime/bootstrap/macos-permission-bootstrap"
APP_ROOT="${BOOTSTRAP_ROOT}/OpenDesk.app"
CONTENTS_DIR="${APP_ROOT}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
EXECUTABLE_PATH="${MACOS_DIR}/opendesk"
PLIST_PATH="${CONTENTS_DIR}/Info.plist"

rm -rf "${APP_ROOT}"
mkdir -p "${MACOS_DIR}"

CGO_ENABLED=0 go build -o "${EXECUTABLE_PATH}" ./cmd/macos-permission-bootstrap

cat > "${PLIST_PATH}" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>OpenDesk</string>
  <key>CFBundleExecutable</key>
  <string>opendesk</string>
  <key>CFBundleIdentifier</key>
  <string>com.opendesk.cli</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>OpenDesk</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>OpenDesk needs Automation permission to control System Events and target applications for desktop automation workflows.</string>
</dict>
</plist>
EOF

codesign --force --deep --sign - "${APP_ROOT}" >/dev/null

printf 'Built helper app: %s\n' "${APP_ROOT}"
printf 'Launch with: open -n "%s" --args -mode all -keepalive 90s\n' "${APP_ROOT}"
printf 'Helper log: %sopendesk-permission-bootstrap.log\n' "$(getconf DARWIN_USER_TEMP_DIR)"
