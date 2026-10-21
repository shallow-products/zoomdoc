#!/bin/sh
# CI smoke test: check that the hooks and bundled scripts run in a user's environment (plain Node.js).
# It uses neither npm install nor the repository's source. Node.js 18 or later is assumed.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

mkdir -p .zoomdoc docs/guides
printf '%s\n' 'folders:' '  docs/guides:' '    description: g' > .zoomdoc/schema.yaml
printf '%s\n' '---' 'title: t' 'description: d' '---' '[x](missing.md)' > docs/guides/a.md

echo "node $(node --version)"

out="$(node "$ROOT/scripts/hooks/run.js" --env=claude --force)"
echo "$out" | grep -q 'zoomdoc Notice' || { echo "run.js: スキーマの注入が出ない"; exit 1; }
echo "$out" | grep -q 'missing.md' || { echo "run.js: リンク切れの通知が出ない"; exit 1; }

if node "$ROOT/dist/doc_lint.js" > lint.out 2>&1; then
  echo "dist/doc_lint.js: 壊れたリンクがあるのに合格した"; exit 1
fi
grep -q 'missing.md' lint.out || { echo "dist/doc_lint.js: リンク切れを指摘しない"; exit 1; }

node "$ROOT/dist/migrate.js" 2>&1 | grep -q 'zoomdoc migrate' || { echo "dist/migrate.js: 使い方が出ない"; exit 1; }

echo "smoke ok"
