$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Origin requires Node.js 22 or newer. Install Node.js, then run this script again."
}
node scripts/install.mjs
exit $LASTEXITCODE
