#!/usr/bin/env bash
# Build the Chrome Web Store upload zip: only the files the extension needs
# (manifest + src). Excludes tests, node_modules, docs, .git and OS junk.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/audio-for-wikipedia-${version}.zip"

mkdir -p dist
rm -f "$out"
zip -r -q "$out" manifest.json src -x '*.DS_Store' -x '*.map'
echo "Created $out"
unzip -Z1 "$out" | sed "s/^/  /"
