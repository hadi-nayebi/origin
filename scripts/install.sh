#!/usr/bin/env sh
set -eu
command -v node >/dev/null 2>&1 || { echo "Origin requires Node.js 22 or newer." >&2; exit 1; }
node scripts/install.mjs
