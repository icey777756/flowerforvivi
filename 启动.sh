#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${PORT:-5178}"
URL="http://127.0.0.1:${PORT}/"

open_browser() {
  sleep 1
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
}

open_browser &
if command -v node >/dev/null 2>&1; then
  echo "Starting 指尖生花 at ${URL}"
  node server.mjs
elif command -v python3 >/dev/null 2>&1; then
  echo "Node.js not found, using Python at ${URL}"
  python3 -m http.server "${PORT}"
elif command -v python >/dev/null 2>&1; then
  echo "Node.js not found, using Python at ${URL}"
  python -m http.server "${PORT}"
else
  echo "Please install Node.js 18+ or Python 3."
  exit 1
fi
