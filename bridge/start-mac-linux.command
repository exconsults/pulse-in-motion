#!/bin/sh
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
if [ ! -f .env ]; then
  printf "Paste your SmartSpectra API key and press Enter: "
  read KEY
  echo "SMARTSPECTRA_API_KEY=$KEY" > .env
fi
node server.mjs
