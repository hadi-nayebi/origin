# Install Origin

Origin 1.0 requires one interactive Codex session connected to the dashboard through tmux. The
required machine kit is Git, GitHub CLI, Node.js 22 or newer, npm, tmux, Codex CLI, and GitHub and
Codex authentication.

## macOS, Linux, and WSL2

```bash
./scripts/install.sh
```

The installer asks before installing system software. On supported package managers it installs
missing Git, GitHub CLI, tmux, Node/npm, and the official `@openai/codex` package, then installs
repository dependencies and runs the complete test/build/doctor contract. It then offers the
user-owned GitHub and Codex authentication steps; it never embeds credentials.

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

Authenticate Codex using the current Codex CLI login flow and authenticate GitHub with
`gh auth login`, then run:

```bash
npm run doctor
npm run origin
```

The doctor treats every missing runtime component as blocking. The launcher never falls back to a
headless worker or a dashboard-only mode.

`npm run origin` starts or reuses the dashboard, opens the default browser, attaches the
repository-scoped terminal session, and runs `codex resume --last`. Codex starts fresh when that
repository has no saved interactive chat. Use `npm run origin:new` only when you intentionally want
a separate chat.

On first launch, use `/hooks` in Codex to inspect and trust the two channel Stop hooks and the
owner-authority PreToolUse hook. The latter permits branch work and PR creation but blocks supported
agent merge paths; only the dashboard or paired Telegram owner action may merge and resolve a work
unit. This is an intentional security boundary.

The browser's four-step guide introduces the empty canvas, Feedback, Admin, and optional Telegram.
Finish or skip it after inspection; **Show the quick guide** on the canvas reopens it later.

## Recovery

- `npm run origin` reuses the healthy dashboard and repository-scoped tmux session and resumes the
  repository's newest saved Codex chat by default.
- `npm run origin:new` explicitly starts a separate Codex chat.
- `npm run wake` retries durable pending dashboard wake events.
- `.origin/dashboard.log` contains dashboard startup diagnostics.
- `.origin/wake-outbox.json` records wake attempts and outcomes.
- `.origin/feedback.jsonl` is the authoritative feedback journal.
- `.origin/contextual-feedback/data.json` is the dashboard channel's continuation state.
- `.origin/telegram-engagement/data.json` is the optional Telegram channel's continuation state.
- `.origin/agent-stop-state/data.json`, when present, is legacy input imported once into dashboard
  state; it is not the current global source of truth.
- `.origin/worktrees/` contains the private per-thread worktrees. GitHub PRs remain the reviewed
  publication boundary.

If feedback or agent state fails validation, pending wakes remain retryable rather than being
cancelled. Recover the authoritative file first, then run `npm run wake`.

Do not delete `.origin/` to repair a transport failure. The journal and state are user-owned local
history; inspect and back them up first.
