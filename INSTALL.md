# Install Origin

Origin requires Git and Node.js 22 or newer. It does not require Docker, a
database, GitHub CLI, tmux, or a cloud account.

## macOS, Linux, and WSL2

```bash
./scripts/install.sh
npm run origin
```

## Native Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
npm run origin
```

The installers verify prerequisites, install repository-local npm packages,
and run tests and the production build. They do not install system software
without the user's involvement.

