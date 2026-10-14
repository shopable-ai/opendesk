#!/usr/bin/env bash
# Developer-only AppKit bundle with a stable ad-hoc identity. Never installs itself.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This AppKit .app build requires macOS and the Xcode Command Line Tools." >&2
  exit 1
fi

project="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(cd "$project/../.." && pwd)"
output_dir="$root/.runtime/tests/desktop-reset-clock/v1"
if [[ $# -gt 0 ]]; then
  if [[ $# -ne 2 || "$1" != "--output-dir" || "$2" != /* ]]; then
    echo "Usage: $0 [--output-dir /absolute/versioned/directory]" >&2
    exit 2
  fi
  output_dir="$2"
fi
bundle="$output_dir/Reset Clock.app"
exe="$bundle/Contents/MacOS/reset-clock"
if [[ -e "$bundle" ]]; then
  echo "Existing dev app is preserved: $bundle" >&2
  echo "Use --output-dir with a new versioned directory." >&2
  exit 1
fi
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>reset-clock</string>
  <key>CFBundleIdentifier</key><string>com.opendesk.resetclock</string>
  <key>CFBundleName</key><string>Reset Clock</string>
  <key>CFBundleDisplayName</key><string>Reset Clock</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
(
  cd "$project"
  CGO_ENABLED=1 go build -trimpath -o "$exe" ./cmd/desktop-reset-clock
)
# Seal the completed bundle; keep the same identifier across development builds.
{
  git -C "$root" rev-parse HEAD
  git -C "$root" status --short -- examples/desktop-reset-clock
  (cd "$project" && shasum -a 256 internal/desktop/native_darwin.m internal/desktop/native_darwin.go internal/desktop/hero_art.go internal/desktop/assets/r23-c3-reference-hero.webp internal/settings/settings.go)
} > "$bundle/Contents/Resources/build-provenance.txt"
codesign --force --sign - --identifier com.opendesk.resetclock "$bundle"
codesign --verify --strict --verbose=2 "$bundle"
plutil -lint "$bundle/Contents/Info.plist"
test -x "$exe"
echo "Ad-hoc signed local development app (not notarized): $bundle"
echo "Start the Bridge separately; then open the app with:"
echo "open '$bundle' --args -feed http://127.0.0.1:8788/feed -allow-local-http"
echo "This is not notarized or a claim of live AppKit window acceptance."
