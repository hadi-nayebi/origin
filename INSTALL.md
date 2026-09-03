# Install Origin

Origin needs Node.js 22 or newer and Git. Git clones the repository and lets the Codex Stop hook
resolve its stable path from nested working directories. Docker, a database, GitHub CLI, Python, and
a cloud account are not required.

For automatic feedback delivery, install and authenticate Codex CLI so `codex` is available on
`PATH`. The dashboard and durable queue remain usable without it.

The first time Codex opens this repository, use `/hooks` to review and trust the project Stop hook.
This is an intentional Codex security boundary; Origin cannot and should not bypass it silently.

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

Both launchers call the same `scripts/install.mjs` implementation. It uses `npm ci`, runs the
complete verification suite and production build, and runs the repository doctor. It never installs
system software.

## Diagnose

```bash
npm run doctor
npm run doctor -- --require-agent
```

The first command verifies the dashboard and harness and explains whether automatic delivery is
available. The second treats a missing agent command as a blocking failure.

To use another locally installed CLI adapter without changing source, set `ORIGIN_AGENT_COMMAND` and
`ORIGIN_AGENT_ARGS_JSON`. Both are operator-owned configuration. Origin never derives them from
feedback.

To record feedback without launching an agent automatically:

```bash
ORIGIN_AGENT_AUTOSTART=0 npm run origin
```
