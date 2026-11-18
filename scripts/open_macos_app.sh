#!/usr/bin/env bash

set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || {
  printf 'This script is for macOS only.\n' >&2
  exit 1
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${OPENDESK_APP:-${ROOT_DIR}/dist/OpenDesk.app}"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "OpenDesk.app not found at ${APP_PATH}" >&2
  exit 1
fi

source "${ROOT_DIR}/scripts/macos_signing.sh"
macos_signing_load verify
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${APP_PATH}/Contents/Info.plist")"
macos_signing_verify_app "${APP_PATH}" "${bundle_id}"

args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -script)
      if [[ $# -lt 2 ]]; then
        echo "-script requires a path" >&2
        exit 1
      fi
      script_path="$2"
      if [[ "${script_path}" != /* ]]; then
        script_path="$(cd "${ROOT_DIR}" && cd "$(dirname "${script_path}")" && pwd)/$(basename "${script_path}")"
      fi
      args+=("$1" "${script_path}")
      shift 2
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

if [[ ${#args[@]} == 0 ]]; then exec open "${APP_PATH}"; fi
exec open "${APP_PATH}" --args "${args[@]}"
