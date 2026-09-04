#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/.runtime/tests/custom-ui/icon-list"
PUBLISH=false
if [[ $# -gt 1 ]]; then
  printf 'Usage: bash scripts/render_custom_ui_icon_catalog.sh [--publish|output-directory]\n' >&2
  exit 2
fi
if [[ "${1:-}" == "--publish" ]]; then
  PUBLISH=true
elif [[ -n "${1:-}" ]]; then
  OUTPUT_DIR="$1"
fi
REGISTRY="${ROOT_DIR}/pkg/customui/assets/toolbar-icons-v1.json"
RENDERER="${ROOT_DIR}/tests/custom-ui/tools/icon-catalog/main.swift"
PUBLISHED_HTML="${ROOT_DIR}/docs/custom-ui/icon-list.html"
PUBLISHED_RUNTIME_HTML="${ROOT_DIR}/examples/custom-ui/icon-list.html"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'Custom UI icon catalog rendering requires macOS and AppKit.\n' >&2
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  printf 'Custom UI icon catalog rendering requires the Swift toolchain.\n' >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
swift "${RENDERER}" "${REGISTRY}" "${OUTPUT_DIR}"

if [[ "${PUBLISH}" == true ]]; then
  mkdir -p "$(dirname "${PUBLISHED_HTML}")"
  install -m 0644 "${OUTPUT_DIR}/index.html" "${PUBLISHED_HTML}"
  install -m 0644 "${OUTPUT_DIR}/runtime-window.html" "${PUBLISHED_RUNTIME_HTML}"
  printf 'Published Custom UI icon catalog: %s\n' "${PUBLISHED_HTML}"
  printf 'Published Runtime icon catalog view: %s\n' "${PUBLISHED_RUNTIME_HTML}"
fi

printf 'Custom UI icon catalog HTML: %s\n' "${OUTPUT_DIR}/index.html"
printf 'Custom UI Runtime icon catalog view: %s\n' "${OUTPUT_DIR}/runtime-window.html"
printf 'Custom UI icon contact sheet: %s\n' "${OUTPUT_DIR}/contact-sheet.png"
printf 'Custom UI icon manifest: %s\n' "${OUTPUT_DIR}/manifest.json"
