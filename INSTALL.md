# Install Origin

Origin 1.0 requires one interactive Codex session connected to the dashboard through tmux. The
required machine kit is Git, Node.js 22 or newer, npm, tmux, Codex CLI, and Codex authentication.

## macOS, Linux, and WSL2

```bash
./scripts/install.sh
```

The installer asks before installing system software. On supported package managers it installs
missing Git, tmux, Node/npm, and the official `@openai/codex` package, then installs repository
dependencies and runs the complete test/build/doctor contract. Authentication remains a user-owned
security step.

If a Linux distribution's package manager provides Node older than 22, install the current Node.js
LTS from [nodejs.org](https://nodejs.org/) and rerun the script.

## Windows

The full Origin harness does not run in native PowerShell because tmux is part of the Origin 1.0
transport contract. Install WSL2:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallWsl
```

After any required restart, open the WSL terminal, clone Origin inside the Linux filesystem, and run
`./scripts/install.sh` there.

## Authenticate and inspect

Authenticate Codex using the current Codex CLI login flow, then run:

```bash
npm run doctor
npm run origin
```

The doctor treats every missing runtime component as blocking. The launcher never falls back to a
headless worker or a dashboard-only mode.

On first launch, use `/hooks` in Codex to inspect and trust the repository Stop hook. This is an
intentional security boundary.

## Recovery

- `npm run origin` reuses the healthy dashboard and repository-scoped tmux session.
- `npm run origin:resume` asks Codex to resume its last saved session when a new session is needed.
- `npm run wake` retries durable pending dashboard wake events.
- `.origin/dashboard.log` contains dashboard startup diagnostics.
- `.origin/wake-outbox.json` records wake attempts and outcomes.
- `.origin/feedback.jsonl` is the authoritative feedback journal.
- `.origin/agent-stop-state/data.json` is the current global continuation state.

Do not delete `.origin/` to repair a transport failure. The journal and state are user-owned local
history; inspect and back them up first.
