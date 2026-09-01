#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime/tests/app-icons"
LOGO="${ROOT_DIR}/public/logo.png"
MACOS_ICON="${ROOT_DIR}/public/icons/opendesk.icns"
WINDOWS_ICON="${ROOT_DIR}/public/icons/opendesk.ico"
NOTIFICATION_ICON="${ROOT_DIR}/public/icons/opendesk-notification.png"

if command -v magick >/dev/null 2>&1; then
  USE_MAGICK=1
else
  USE_MAGICK=0
  if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'from PIL import Image' >/dev/null 2>&1; then
    printf 'Required app icon test tools are unavailable: magick or python3 with Pillow\n' >&2
    exit 1
  fi
fi
for tool in iconutil plutil; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    printf 'Required app icon test tool is unavailable: %s\n' "${tool}" >&2
    exit 1
  fi
done
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
  printf 'Required app icon test tool is unavailable: go\n' >&2
  exit 1
fi

rm -rf "${RUNTIME_DIR}"
mkdir -p "${RUNTIME_DIR}"

asset_hashes() {
  shasum -a 256 "${LOGO}" "${MACOS_ICON}" "${WINDOWS_ICON}" "${NOTIFICATION_ICON}"
}

before="$(asset_hashes)"
RUNTIME_DIR="${RUNTIME_DIR}/generator" "${ROOT_DIR}/scripts/generate_app_icons.sh" \
  >"${RUNTIME_DIR}/generator.log"
after="$(asset_hashes)"
if [[ "${before}" != "${after}" ]]; then
  printf 'App icon generation changed stable output on a no-op regeneration.\n' >&2
  diff <(printf '%s\n' "${before}") <(printf '%s\n' "${after}") >&2 || true
  exit 1
fi

assert_png() {
  local path="$1"
  local expected_size="$2"
  local actual
  if [[ "${USE_MAGICK}" -eq 1 ]]; then
    actual="$(magick identify -format '%wx%h %[channels]' "${path}")"
    [[ "${actual}" == "${expected_size} srgba 4.0" ]] || {
      printf 'Unexpected PNG contract for %s: %s\n' "${path}" "${actual}" >&2
      exit 1
    }
  else
    actual="$(python3 - "${path}" <<'PY'
from PIL import Image
import sys
with Image.open(sys.argv[1]) as image:
    print(f"{image.width}x{image.height} {image.mode}")
PY
)"
    [[ "${actual}" == "${expected_size} RGBA" ]] || {
      printf 'Unexpected PNG contract for %s: %s\n' "${path}" "${actual}" >&2
      exit 1
    }
  fi
}

assert_png "${LOGO}" "1024x1024"
assert_png "${NOTIFICATION_ICON}" "256x256"

if [[ "${USE_MAGICK}" -eq 1 ]]; then
  alpha_range="$(magick "${LOGO}" -alpha extract -format '%[fx:minima] %[fx:maxima]' info:)"
else
  alpha_range="$(python3 - "${LOGO}" <<'PY'
from PIL import Image
import sys
with Image.open(sys.argv[1]).convert("RGBA") as image:
    alpha = image.getchannel("A")
    extrema = alpha.getextrema()
    if extrema != (0, 255):
        raise SystemExit(f"unexpected alpha extrema: {extrema}")
    print("0 1")
PY
)"
fi
if [[ "${alpha_range}" != "0 1" ]]; then
  printf 'Canonical logo must contain transparent and opaque pixels, got alpha range %s\n' "${alpha_range}" >&2
  exit 1
fi

if [[ "${USE_MAGICK}" -eq 1 ]]; then
  ico_sizes="$(magick identify -format '%wx%h\n' "${WINDOWS_ICON}")"
else
  ico_sizes="$(python3 - "${WINDOWS_ICON}" <<'PY'
import struct
import sys
data = open(sys.argv[1], "rb").read()
reserved, kind, count = struct.unpack_from("<HHH", data, 0)
if reserved != 0 or kind != 1:
    raise SystemExit("invalid ICO header")
for index in range(count):
    width, height = struct.unpack_from("<BB", data, 6 + index * 16)
    print(f"{width or 256}x{height or 256}")
PY
)"
fi
expected_ico_sizes=$'16x16\n24x24\n32x32\n48x48\n64x64\n128x128\n256x256'
if [[ "${ico_sizes}" != "${expected_ico_sizes}" ]]; then
  printf 'Unexpected Windows ICO frames:\n%s\n' "${ico_sizes}" >&2
  exit 1
fi

VERIFIED_ICONSET="${RUNTIME_DIR}/verified.iconset"
iconutil -c iconset "${MACOS_ICON}" -o "${VERIFIED_ICONSET}"
while read -r name expected_size; do
  if [[ "${USE_MAGICK}" -eq 1 ]]; then
    actual_size="$(magick identify -format '%wx%h' "${VERIFIED_ICONSET}/${name}")"
  else
    actual_size="$(python3 - "${VERIFIED_ICONSET}/${name}" <<'PY'
from PIL import Image
import sys
with Image.open(sys.argv[1]) as image:
    print(f"{image.width}x{image.height}")
PY
)"
  fi
  if [[ "${actual_size}" != "${expected_size}" ]]; then
    printf 'Unexpected macOS iconset member %s: %s\n' "${name}" "${actual_size}" >&2
    exit 1
  fi
done <<'EOF'
icon_16x16.png 16x16
icon_16x16@2x.png 32x32
icon_32x32.png 32x32
icon_32x32@2x.png 64x64
icon_128x128.png 128x128
icon_128x128@2x.png 256x256
icon_256x256.png 256x256
icon_256x256@2x.png 512x512
icon_512x512.png 512x512
icon_512x512@2x.png 1024x1024
EOF

"${GO_BIN}" test \
  "${ROOT_DIR}/automation/notification_icon.go" \
  "${ROOT_DIR}/automation/notification_icon_test.go" \
  -count=1

PACKAGE_DIST="${RUNTIME_DIR}/package-dist"
mkdir -p "${PACKAGE_DIST}"
cp /usr/bin/true "${PACKAGE_DIST}/opendesk"
cp /usr/bin/true "${PACKAGE_DIST}/opendesk-ui-host"
GO_BIN=/usr/bin/true SKIP_CODESIGN=1 DIST_DIR="${PACKAGE_DIST}" \
  "${ROOT_DIR}/scripts/build_macos_app.sh" >"${RUNTIME_DIR}/package.log"

bundle_icon_name="$(plutil -extract CFBundleIconFile raw "${PACKAGE_DIST}/OpenDesk.app/Contents/Info.plist")"
if [[ "${bundle_icon_name}" != "OpenDesk.icns" ]]; then
  printf 'Unexpected CFBundleIconFile: %s\n' "${bundle_icon_name}" >&2
  exit 1
fi
cmp "${MACOS_ICON}" "${PACKAGE_DIST}/OpenDesk.app/Contents/Resources/${bundle_icon_name}"

printf 'App icon assets passed deterministic generation, format, resolver, and bundle tests.\n'
printf 'Evidence: %s\n' "${RUNTIME_DIR}"
