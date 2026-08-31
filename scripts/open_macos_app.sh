#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${ROOT_DIR}/dist/Clawdesk.app"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Clawdesk.app not found at ${APP_PATH}" >&2
  exit 1
fi

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

nohup open "${APP_PATH}" --args "${args[@]}" >/dev/null 2>&1 &
