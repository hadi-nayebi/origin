#!/usr/bin/env sh
set -eu

confirm() {
  if [ "${ORIGIN_INSTALL_YES:-0}" = "1" ]; then return 0; fi
  printf '%s' "Origin may install Git, tmux, Node.js, and Codex CLI on this computer. Continue? [y/N] "
  read -r answer
  case "$answer" in y|Y|yes|YES) return 0 ;; *) echo "Installation cancelled."; exit 1 ;; esac
}

install_system_kit() {
  if [ "$(uname -s)" = "Darwin" ]; then
    command -v brew >/dev/null 2>&1 || { echo "Install Homebrew from https://brew.sh, then rerun this script." >&2; exit 1; }
    brew install git tmux node@22
    brew link --overwrite node@22 >/dev/null 2>&1 || true
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y git tmux nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git tmux nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --needed git tmux nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y git tmux nodejs npm
  else
    echo "No supported package manager was found. Install Git, tmux, and Node.js 22+ and rerun." >&2
    exit 1
  fi
}

missing_system=0
for command_name in git tmux node npm; do
  command -v "$command_name" >/dev/null 2>&1 || missing_system=1
done
missing_codex=0
command -v codex >/dev/null 2>&1 || missing_codex=1

if [ "$missing_system" = "1" ] || [ "$missing_codex" = "1" ]; then confirm; fi
if [ "$missing_system" = "1" ]; then install_system_kit; fi

node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ "$node_major" -lt 22 ]; then
  echo "The package manager installed Node.js $(node --version), but Origin requires Node.js 22+. Install the current Node.js LTS from https://nodejs.org and rerun." >&2
  exit 1
fi

if [ "$missing_codex" = "1" ]; then npm install --global @openai/codex; fi

if ! codex login status >/dev/null 2>&1; then
  echo "Codex is installed but is not authenticated. Origin will now open the official Codex login flow."
  codex login
fi

node scripts/install.mjs
