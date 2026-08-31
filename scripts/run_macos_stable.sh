#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_PATH="${CLAWDESK_BINARY:-${ROOT_DIR}/dist/clawdesk}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS only." >&2
  exit 1
fi

if [[ "${REBUILD:-0}" == "1" ]]; then
  if ! command -v go >/dev/null 2>&1; then
    echo "REBUILD=1 requires Go in PATH" >&2
    exit 1
  fi
  echo "[build] compiling stable binary -> ${BIN_PATH}"
  CGO_ENABLED=1 go build -o "${BIN_PATH}" "${ROOT_DIR}"
  chmod +x "${BIN_PATH}"
fi

if [[ ! -x "${BIN_PATH}" ]]; then
  echo "stable Clawdesk binary not found or not executable: ${BIN_PATH}" >&2
  echo "build it with scripts/build_macos_app.sh or set CLAWDESK_BINARY" >&2
  exit 1
fi

APP_EXECUTABLE_PATH="${ROOT_DIR}/dist/Clawdesk.app/Contents/MacOS/clawdesk"
BUILD_STAMP_PATH="${ROOT_DIR}/dist/Clawdesk.app/Contents/Resources/clawdesk-payload.sha256"
if [[ -f "${BIN_PATH}" && -f "${BUILD_STAMP_PATH}" ]]; then
  bin_digest="$(shasum -a 256 "${BIN_PATH}" | awk '{print $1}')"
  app_digest="$(sed -n '1p' "${BUILD_STAMP_PATH}")"
  if [[ -z "${app_digest}" || "${app_digest}" != "${bin_digest}" ]]; then
    echo "[warning] fixed Clawdesk.app is not synchronized with ${BIN_PATH}; rebuild with scripts/build_macos_app.sh" >&2
  fi
elif [[ -f "${APP_EXECUTABLE_PATH}" ]]; then
  echo "[warning] cannot prove fixed Clawdesk.app is synchronized; rebuild with scripts/build_macos_app.sh" >&2
fi

exec "${BIN_PATH}" "$@"
