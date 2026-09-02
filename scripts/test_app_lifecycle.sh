#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || {
  printf 'This script is for macOS only.\n' >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

artifact_dir="$repo_root/.runtime/tests/platform-primitives/task-007-app-lifecycle"
bundle="$artifact_dir/OpenDeskAppLifecycleFixture.app"
executable="$bundle/Contents/MacOS/OpenDeskAppLifecycleFixture"

mkdir -p "$bundle/Contents/MacOS"
cp tests/runtime-api/fixtures/app-lifecycle/Info.plist "$bundle/Contents/Info.plist"
/usr/bin/clang -fobjc-arc -framework AppKit \
  tests/runtime-api/fixtures/app-lifecycle/main.m \
  -o "$executable"

./opendesk -script tests/runtime-api/live/app-lifecycle.test.js -console-mode script
