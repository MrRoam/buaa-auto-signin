#!/usr/bin/env bash
set -u
cd "$(dirname "$0")"
finish() {
  status="$1"
  if [ "$status" -ne 0 ] && [ -t 0 ]; then
    printf '\n启动失败。按回车关闭窗口。'
    read -r _
  fi
  exit "$status"
}
command -v node >/dev/null 2>&1 || { echo "需要 Node.js 18 或更高版本：https://nodejs.org/"; finish 1; }
node ./src/validate-config.mjs ./config.json >/dev/null 2>&1 || node ./src/setup.mjs || finish 1
node ./src/index.mjs --config ./config.json || finish $?
