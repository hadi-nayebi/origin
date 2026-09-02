$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Origin requires Node.js 22 or newer. Install Node.js, then run this script again."
}
$major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 22) { throw "Origin requires Node.js 22 or newer; found $(node --version)." }
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Origin is ready. Run: npm run origin"

