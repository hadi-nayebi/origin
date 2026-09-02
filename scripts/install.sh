#!/usr/bin/env sh
set -eu
command -v node >/dev/null 2>&1 || { echo "Origin requires Node.js 22 or newer." >&2; exit 1; }
major="$(node -p 'process.versions.node.split(`.`)[0]')"
[ "$major" -ge 22 ] || { echo "Origin requires Node.js 22 or newer; found $(node --version)." >&2; exit 1; }
npm install
npm run check
echo "Origin is ready. Run: npm run origin"

