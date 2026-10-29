#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"
source scripts/macos_signing.sh
macos_signing_load
[[ "$MACOS_SIGNING_MODE" == development ]] || { echo 'Test chat requires the pinned development identity.' >&2; exit 1; }
APP="$ROOT_DIR/.runtime/apps/OpenDeskSupportChat.app"
mkdir -p "$APP/Contents/MacOS"
/usr/bin/swiftc tests/custom-ui/tools/support-chat/main.swift -o "$APP/Contents/MacOS/support-chat" -framework AppKit
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.opendesk.test.support-chat</string>
<key>CFBundleName</key><string>OpenDesk Support Test Chat</string>
<key>CFBundleExecutable</key><string>support-chat</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>2.3</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
macos_signing_sign_one "$APP" com.opendesk.test.support-chat
macos_signing_verify_app "$APP" com.opendesk.test.support-chat
shasum -a 256 tests/custom-ui/tools/support-chat/main.swift > .runtime/apps/support-chat-source.sha256
printf 'Built %s\n' "$APP"
