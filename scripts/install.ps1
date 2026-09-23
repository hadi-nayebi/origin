param([switch]$InstallWsl)
$ErrorActionPreference = "Stop"

if ($env:WSL_DISTRO_NAME) {
  throw "Run ./scripts/install.sh inside WSL2."
}

if ($InstallWsl) {
  Write-Host "Origin 1.0 uses tmux and must run inside WSL2 on Windows. Windows may request administrator approval and a restart."
  wsl --install
  Write-Host "After Windows restarts, create the owner-controlled Origin copy described in INSTALL.md inside WSL, and run ./scripts/install.sh."
  exit 0
}

throw "Origin 1.0 does not run its combined interactive harness in native PowerShell. Run this script with -InstallWsl, then install Origin inside WSL2."
