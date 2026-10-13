#!/usr/bin/env bash
# Developer-only, unsigned AppKit bundle. Never publishes or installs itself.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This AppKit .app build requires macOS and the Xcode Command Line Tools." >&2
  exit 1
fi

project="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(cd "$project/../.." && pwd)"
bundle="$root/.runtime/tests/desktop-reset-clock/v1/Reset Clock.app"
exe="$bundle/Contents/MacOS/reset-clock"
if [[ -e "$exe" ]]; then
  echo "Existing dev app is preserved: $bundle" >&2
  echo "Move that build aside manually before building a new one." >&2
  exit 1
fi
mkdir -p "$bundle/Contents/MacOS"
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
plutil -lint "$bundle/Contents/Info.plist"
test -x "$exe"
echo "Unsigned local development app: $bundle"
echo "Start the Bridge separately; then open the app with:"
echo "open '$bundle' --args -feed http://127.0.0.1:8788/feed -allow-local-http"
echo "This is not notarized or a claim of live AppKit window acceptance."
