#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -f ./config.json ]; then
  node ./src/setup.mjs || exit 1
fi
node ./src/index.mjs --config ./config.json
