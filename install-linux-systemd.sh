#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
"$NODE" "$ROOT/src/validate-config.mjs" "$ROOT/config.json"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/iclass-standalone-signin.service"
mkdir -p "$UNIT_DIR" "$ROOT/logs"
escape_systemd() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/%/%%/g'
}
ROOT_ESCAPED="$(escape_systemd "$ROOT")"
NODE_ESCAPED="$(escape_systemd "$NODE")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Standalone iclass sign-in checker

[Service]
WorkingDirectory="$ROOT_ESCAPED"
ExecStart="$NODE_ESCAPED" "$ROOT_ESCAPED/src/index.mjs" --config "$ROOT_ESCAPED/config.json"
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now iclass-standalone-signin.service
echo "已安装并启动 user systemd 服务：iclass-standalone-signin.service"
