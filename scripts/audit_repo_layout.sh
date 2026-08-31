#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

failures=0

fail() {
  printf 'LAYOUT-AUDIT FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

for retired_dir in artifacts config fixtures replays temp test; do
  if [[ -e "${retired_dir}" ]]; then
    fail "retired root path exists: ${retired_dir}/"
  fi
done

for generated_file in new.txt screenshot_cut.png test.png test.txt testMonkey.exe; do
  if [[ -e "${generated_file}" ]]; then
    fail "generated or legacy root file exists: ${generated_file}"
  fi
done

while IFS= read -r file; do
  [[ -n "${file}" ]] && fail "tracked macOS metadata: ${file}"
done < <(git ls-files | grep -E '(^|/)\.DS_Store$' || true)

while IFS= read -r file; do
  [[ -n "${file}" ]] && fail "unclassified prompt at prompts root: ${file}"
done < <(find prompts -maxdepth 1 -type f ! -name README.md -print 2>/dev/null)

while IFS= read -r file; do
  [[ -n "${file}" ]] && fail "unclassified schema at schemas root: ${file}"
done < <(find schemas -maxdepth 1 -type f ! -name README.md -print 2>/dev/null)

if grep -RInE "['\"= (]temp/|artifacts/macos-permission-bootstrap|\$ROOT_DIR/temp/" \
  Makefile scripts examples automation cmd pkg --include='*.go' --include='*.js' --include='*.sh' \
  --exclude='audit_repo_layout.sh' 2>/dev/null; then
  fail "an active producer still writes to a retired root output path"
fi

if (( failures > 0 )); then
  printf 'LAYOUT-AUDIT failed=%d\n' "${failures}" >&2
  exit 1
fi

printf 'LAYOUT-AUDIT passed\n'
