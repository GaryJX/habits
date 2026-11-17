#!/bin/sh
# Runs the unit tests in macOS JavaScriptCore (no Node needed).
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat tests/setup.js app.js tests/app.test.js > "$tmp/run.js"
osascript -l JavaScript "$tmp/run.js"
