#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${DIST_DIR:-${ROOT_DIR}/dist}"
APP_ROOT="${DIST_DIR}/OpenDesk.app"
CONTENTS_DIR="${APP_ROOT}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
HELPERS_DIR="${CONTENTS_DIR}/Helpers"
EXECUTABLE_PATH="${MACOS_DIR}/opendesk"
UI_HOST_PATH="${HELPERS_DIR}/opendesk-ui-host"
PLIST_PATH="${CONTENTS_DIR}/Info.plist"
BUNDLE_ID="${BUNDLE_ID:-com.opendesk.cli}"
APP_NAME="${APP_NAME:-OpenDesk}"
VERSION="${VERSION:-0.1.0}"
CODESIGN_IDENTITY="${CODESIGN_IDENTITY:--}"

mkdir -p "${DIST_DIR}"
NATIVE_EXTENSIONS_SOURCE="${NATIVE_EXTENSIONS_SOURCE:-}"

go build -o "${DIST_DIR}/opendesk" ./cmd/opendesk
go build -o "${DIST_DIR}/opendesk-ui-host" ./cmd/opendesk-ui-host

rm -rf "${APP_ROOT}"
mkdir -p "${MACOS_DIR}" "${HELPERS_DIR}"

cp "${DIST_DIR}/opendesk" "${EXECUTABLE_PATH}"
cp "${DIST_DIR}/opendesk-ui-host" "${UI_HOST_PATH}"
rsync -a --delete "${ROOT_DIR}/polyfills/" "${MACOS_DIR}/polyfills/"
rsync -a --delete "${ROOT_DIR}/jslibs/" "${MACOS_DIR}/jslibs/"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
if [[ -n "${NATIVE_EXTENSIONS_SOURCE}" ]]; then
  if [[ "${NATIVE_EXTENSIONS_SOURCE}" != /* ]]; then
    printf 'NATIVE_EXTENSIONS_SOURCE must be an absolute path: %s\n' "${NATIVE_EXTENSIONS_SOURCE}" >&2
    exit 1
  fi
  if [[ -L "${NATIVE_EXTENSIONS_SOURCE}" || ! -d "${NATIVE_EXTENSIONS_SOURCE}" ]]; then
    printf 'NATIVE_EXTENSIONS_SOURCE must be a real directory, not a symlink: %s\n' "${NATIVE_EXTENSIONS_SOURCE}" >&2
    exit 1
  fi
  if [[ -n "$(find "${NATIVE_EXTENSIONS_SOURCE}" -type l -print -quit)" ]]; then
    printf 'Native Extension staging rejects symlinks: %s\n' "${NATIVE_EXTENSIONS_SOURCE}" >&2
    exit 1
  fi
  bundle_count=0
  while IFS= read -r -d '' bundle; do
    if [[ ! -d "${bundle}" || ! -f "${bundle}/extension.json" ]]; then
      printf 'Native Extension staging accepts only bundle directories containing extension.json: %s\n' "${bundle}" >&2
      exit 1
    fi
    bundle_count=$((bundle_count + 1))
  done < <(find "${NATIVE_EXTENSIONS_SOURCE}" -mindepth 1 -maxdepth 1 -print0)
  if [[ "${bundle_count}" -eq 0 ]]; then
    printf 'NATIVE_EXTENSIONS_SOURCE contains no extension bundles: %s\n' "${NATIVE_EXTENSIONS_SOURCE}" >&2
    exit 1
  fi
  mkdir -p "${RESOURCES_DIR}/NativeExtensions"
  rsync -a --delete "${NATIVE_EXTENSIONS_SOURCE}/" "${RESOURCES_DIR}/NativeExtensions/"
  chmod -R go-w "${RESOURCES_DIR}/NativeExtensions"
  printf 'Staged Native Extensions before codesign: %s\n' "${RESOURCES_DIR}/NativeExtensions"
fi

<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>opendesk</string>
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
  <string>OpenDesk needs Automation permission to control System Events and target applications for desktop automation workflows.</string>
</dict>
</plist>
EOF

if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  echo "Skipping codesign because SKIP_CODESIGN=1"
else
  codesign --force --deep --sign "${CODESIGN_IDENTITY}" "${APP_ROOT}" >/dev/null
fi

printf 'Built binary: %s\n' "${DIST_DIR}/opendesk"
printf 'Built custom UI host: %s\n' "${UI_HOST_PATH}"
printf 'Built app: %s\n' "${APP_ROOT}"
printf 'Bundle id: %s\n' "${BUNDLE_ID}"
if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  printf 'Codesign: skipped\n'
else
  printf 'Codesign identity: %s\n' "${CODESIGN_IDENTITY}"
fi
printf 'Launch with: open "%s"\n' "${APP_ROOT}"
