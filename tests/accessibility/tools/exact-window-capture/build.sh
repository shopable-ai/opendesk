#!/bin/sh
# Build the test-only exact-window receipt helper.  Its output is deliberately
# local and disposable; it is never installed into dist/ or exposed as a
# Runtime API.
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../../../.." && pwd)
source="$root/tests/accessibility/tools/exact-window-capture/capture_window.m"
output_dir="$root/.runtime/tests/accessibility/tools/exact-window-capture"
output="$output_dir/exact-window-capture"

mkdir -p "$output_dir"
/usr/bin/clang -Wall -Wextra -Werror -O2 \
  -framework AppKit \
  -framework CoreFoundation \
  -framework CoreGraphics \
  -framework ImageIO \
  "$source" -o "$output"
printf '%s\n' "$output"
