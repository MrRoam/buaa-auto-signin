#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/iclass-standalone-signin.service"
mkdir -p "$UNIT_DIR" "$ROOT/logs"
cat > "$UNIT" <<UNIT
[Unit]
Description=Standalone iclass sign-in checker

[Service]
WorkingDirectory=$ROOT
ExecStart=$NODE $ROOT/src/index.mjs --config $ROOT/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now iclass-standalone-signin.service
echo "已安装并启动 user systemd 服务：iclass-standalone-signin.service"
