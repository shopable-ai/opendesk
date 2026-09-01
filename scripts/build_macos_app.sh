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
CLAWDESK_UI_HOST_PATH="${HELPERS_DIR}/clawdesk-ui-host"
STATUS_HELPER_PATH="${HELPERS_DIR}/opendesk-status"
PLIST_PATH="${CONTENTS_DIR}/Info.plist"
APP_ICON_SOURCE="${ROOT_DIR}/public/icons/opendesk.icns"
APP_ICON_NAME="OpenDesk.icns"
BUNDLE_ID="${BUNDLE_ID:-com.opendesk.cli}"
APP_NAME="${APP_NAME:-OpenDesk}"
VERSION="${VERSION:-0.1.0}"
CODESIGN_IDENTITY="${CODESIGN_IDENTITY:--}"
NATIVE_EXTENSIONS_SOURCE="${NATIVE_EXTENSIONS_SOURCE:-}"

mkdir -p "${DIST_DIR}"

GO_BIN="${GO_BIN:-$(command -v go || true)}"
if [[ -z "${GO_BIN}" ]]; then
  for candidate in \
    "${HOME}/.local/opt/go/bin/go" \
    "/opt/homebrew/bin/go" \
    "/usr/local/go/bin/go"; do
    if [[ -x "${candidate}" ]]; then
      GO_BIN="${candidate}"
      break
    fi
  done
fi
if [[ -z "${GO_BIN}" ]]; then
  echo "Go compiler not found; set GO_BIN or add Go to PATH" >&2
  exit 1
fi

"${GO_BIN}" build -o "${DIST_DIR}/opendesk" ./cmd/opendesk
"${GO_BIN}" build -o "${DIST_DIR}/opendesk-ui-host" ./cmd/opendesk-ui-host
"${GO_BIN}" build -o "${DIST_DIR}/opendesk-status" ./cmd/opendesk-status

if [[ ! -f "${APP_ICON_SOURCE}" ]]; then
  printf 'App icon is missing: %s\nRun scripts/generate_app_icons.sh first.\n' "${APP_ICON_SOURCE}" >&2
  exit 1
fi

rm -rf "${APP_ROOT}"
mkdir -p "${MACOS_DIR}" "${HELPERS_DIR}" "${RESOURCES_DIR}"

cp "${DIST_DIR}/opendesk" "${EXECUTABLE_PATH}"
cp "${DIST_DIR}/opendesk-ui-host" "${UI_HOST_PATH}"
cp "${DIST_DIR}/opendesk-ui-host" "${CLAWDESK_UI_HOST_PATH}"
cp "${DIST_DIR}/opendesk-status" "${STATUS_HELPER_PATH}"
cp "${APP_ICON_SOURCE}" "${RESOURCES_DIR}/${APP_ICON_NAME}"
rsync -a --delete "${ROOT_DIR}/polyfills/" "${MACOS_DIR}/polyfills/"
rsync -a --delete "${ROOT_DIR}/jslibs/" "${MACOS_DIR}/jslibs/"

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
  <string>opendesk</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleIconFile</key>
  <string>${APP_ICON_NAME}</string>
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
  <key>LSUIElement</key>
  <true/>
  <key>LSMultipleInstancesProhibited</key>
  <true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>OpenDesk needs Automation permission to control System Events and target applications for desktop automation workflows.</string>
  <key>NSUserNotificationAlertStyle</key>
  <string>alert</string>
</dict>
</plist>
EOF

if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  echo "Skipping codesign because SKIP_CODESIGN=1"
else
  codesign --force --deep --sign "${CODESIGN_IDENTITY}" "${APP_ROOT}" >/dev/null
  codesign --verify --deep --strict "${APP_ROOT}"
fi

printf 'Built binary: %s\n' "${DIST_DIR}/opendesk"
printf 'Built custom UI host: %s\n' "${UI_HOST_PATH}"
printf 'Built Clawdesk compatibility host: %s\n' "${CLAWDESK_UI_HOST_PATH}"
printf 'Built macOS status helper: %s\n' "${STATUS_HELPER_PATH}"
printf 'Built app: %s\n' "${APP_ROOT}"
printf 'Bundle id: %s\n' "${BUNDLE_ID}"
if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  printf 'Codesign: skipped\n'
else
  printf 'Codesign identity: %s\n' "${CODESIGN_IDENTITY}"
fi
printf 'Launch with: open "%s"\n' "${APP_ROOT}"
