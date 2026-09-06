#!/bin/sh
set -eu

fixture_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$fixture_dir/../../../.." && pwd)
output_root="$repo_root/.runtime/tests/accessibility/windows"
output="$output_root/OpenDeskAccessibilityFixture.exe"

mkdir -p "$output_root"
cd "$repo_root"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build \
  -trimpath -ldflags='-H=windowsgui' \
  -o "$output" ./tests/accessibility/fixtures/windows
printf '%s\n' "$output"
