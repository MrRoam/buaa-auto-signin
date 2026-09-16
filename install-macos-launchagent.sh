#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
"$NODE" "$ROOT/src/validate-config.mjs" "$ROOT/config.json"
PLIST="$HOME/Library/LaunchAgents/com.mentorclaw.iclass.signin.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"
xml_escape() {
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g; s/'"'"'/\&apos;/g'
}
NODE_XML="$(xml_escape "$NODE")"
ROOT_XML="$(xml_escape "$ROOT")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.mentorclaw.iclass.signin</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_XML</string>
    <string>$ROOT_XML/src/index.mjs</string>
    <string>--config</string>
    <string>$ROOT_XML/config.json</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT_XML</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT_XML/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT_XML/logs/launchd.err.log</string>
</dict>
</plist>
PLIST
launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"
echo "已安装 LaunchAgent：$PLIST"
