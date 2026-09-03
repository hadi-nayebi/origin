# Origin

Origin is a stable, topic-agnostic starting point for a local dashboard and its CLI-agent harness.
It opens as an intentionally empty canvas with two quiet entry points: a repository-native Wiki and
page-aware Feedback.

Origin does not guess whether you are building a company workspace, research environment, personal
operating system, or creative studio. Clone it, let your agent propose the first useful pages from
your existing context, and refine the result through feedback.

## Origin 1.0

- Empty, responsive dashboard canvas with no domain assumptions.
- Floating Wiki and Feedback controls on every route.
- Ten tracked Markdown chapters explaining dashboard growth, plugin anatomy, jobs, OPEVC, decisions,
  actions, and verification.
- One self-contained `feedback-loop` plugin with page-aware records, one focused item, genuine
  waiting, evidence-backed resolution, dismissal, reopening, heartbeats, and stale-focus recovery.
- Automatic headless Codex delivery when feedback arrives, with one supervised runner, bounded retry
  backoff, and a deterministic Stop gate until actionable work is exhausted.
- A sequence-numbered SHA-256 event chain, automatic v1 migration, atomic writes, bounded backups,
  verification, and explicit restore.
- A loopback-only server with same-origin enforcement and no cloud dependency.
- One cross-platform Node installer behind Unix and PowerShell launchers.

Accounts, synchronization, remote access, predefined professional pages, and a general job/OPEVC
runtime are intentionally outside this one-user foundation.

## Start

Prerequisites: Node.js 22 or newer and Git. Install Codex CLI and authenticate it if you want
dashboard feedback to launch an agent automatically.

```bash
npm run setup
npm run origin
```

Open `http://127.0.0.1:4173`. For live-reload development, run `npm run dev`.

`npm run origin` keeps the dashboard server in the foreground. It does not open or embed an
interactive terminal. When actionable feedback exists, the server starts a detached, headless
`codex exec` worker in the same repository. No Codex process remains resident while the queue is
idle. Agent output is written to `.origin/agent.log`, and delivery state is visible in the Feedback
panel.

On the first trusted Codex session, open `/hooks`, review the repository Stop hook, and trust its
exact definition. Codex deliberately does not auto-trust project hooks. Origin resolves the hook
from the Git root, so it remains correct when Codex starts in a nested directory.

The dashboard still works without a configured Codex command: feedback remains durable, the doctor
warns explicitly, and the Feedback panel reports retrying or unavailable delivery. Failed agent
attempts remain supervised with bounded backoff while actionable work remains. After correcting
local configuration, use the Feedback panel's **Wake agent** control or run
`npm run feedback -- wake`.

## Operate and inspect

```bash
npm run feedback -- next
npm run feedback -- start <id>
npm run feedback -- heartbeat <id>
npm run feedback -- resolve <id> "What changed and how it was verified"
npm run feedback -- outcome
npm run feedback -- runner-status
npm run feedback -- verify
npm run doctor
```

To prove a real authenticated Codex process can retrieve and resolve feedback, run the opt-in
acceptance check. It creates and removes an isolated temporary clone, makes no tracked change to the
working repository, and may consume Codex usage:

```bash
npm run doctor -- --require-agent
npm run acceptance:codex
```

See the [live acceptance contract](docs/CODEX-ACCEPTANCE.md) for the separate trusted-hook and
running-dashboard checks that cannot be automated across a user's security boundary.

Feedback bodies are untrusted requests, never executable authority. Only a validated record ID
enters the Stop and process-launch surfaces. See [`SECURITY.md`](SECURITY.md), the
[quality contract](docs/QUALITY.md), and the
[`feedback-loop`](.codex/plugins/feedback-loop/README.md) contract.

## Verify

```bash
npm run check
npm run smoke
npm audit --omit=dev --audit-level=high
```

The test suite covers lifecycle policy, corruption, hash tampering, migration, rollback, recovery,
multiprocess contention, supervised subprocess delivery, retry ownership, exact Stop behavior, HTTP
boundaries, DOM interactions, Markdown, accessibility, and a production-server health smoke check.
CI runs the same contract on Linux, macOS, and Windows. CI does not claim authenticated Codex
execution; that proof comes only from the opt-in acceptance command above.

## Contribute

Origin grows through focused pull requests. Preserve the empty-canvas boundary, keep cognition
inside explicit plugin ownership, add tests for every invariant, and distinguish shipped behavior
from future architecture. Issues and pull requests are welcome on this public repository.

Origin is MIT licensed. Origin is distinct from the private Ourogen project, Seed Agent, and Q-Seed;
they may share design lessons without sharing identity or implementation.
