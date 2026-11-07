#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf 'Install Node.js 20+ from nodejs.org, then reopen this launcher.\n'
else
  if [ -d node_modules ] || npm install; then
    node launch.mjs
  else
    printf 'Installation failed. Check your internet connection and try again.\n'
  fi
fi
printf '\nPress Enter to close this window. '
read REPLY
