# Origin

Origin is the Codex implementation of the
[Hadosh Academy Origin project](https://hadi-nayebi.github.io/projects/origin.html): the smallest
local dashboard-and-harness substrate through which a user and their agent can grow a distinct
operational world.

The shipped dashboard is intentionally empty. It contains a repository-native Wiki, a page-aware
feedback control, one persistent interactive Codex session, and the minimum plugin anatomy needed to
turn comments into durable, bounded, verifiable responsibility.

## Visiting agent: begin here

The primary reader of this repository is often an agent already helping a user through the
[Hadosh Academy Start Here syllabus](https://hadi-nayebi.github.io/start-here-agent.md).

1. Read the complete current syllabus and identify the user's actual onboarding phase.
2. If `ONBOARDING_HANDOFF.md` exists, inspect it and the repository. Do not restart the interview.
3. Confirm the packet's provenance, syllabus version, phase, Asset Charter, privacy and authority
   boundaries, open questions, and next action.
4. Separate direct user statements from prior-agent interpretation, summarize the handoff to the
   user, invite corrections, and record a user-visible receipt before implementation.
5. Use Origin as the generic Phase 6–7 substrate. Derive pages, objects, vocabulary, permissions,
   and later plugins from the user; do not inherit another project's domain.
6. Record which Hadosh patterns were consulted, their maturity, how they were adapted, and how the
   user can inspect, stop, recover, and continue the resulting asset.

Origin is a starting substrate, not a prefabricated agent or a finished domain system.

## What Origin 1.0 includes

- Empty responsive canvas with floating Wiki and Feedback controls.
- One foreground interactive Codex relationship shared by terminal and dashboard.
- Repository-scoped tmux session creation, reuse, attachment, and `--resume-last` support.
- Durable, serialized dashboard-to-Codex wake delivery with per-event markers and verified paste and
  submission evidence.
- `agent-stop-state`: clone-local `idle`, `active`, `waiting`, and `paused` control with a Stop
  hook.
- `contextual-feedback`: raw input, page context, thread messages, interpretation, linked work,
  questions, answers, verification, user acceptance, dismissal, and reopening.
- Sequence-numbered SHA-256 feedback history, atomic lifecycle actions, atomic writes, backups, and
  recovery.
- Loopback-only server and local files under ignored `.origin/`.
- Ten Wiki chapters explaining how dashboards, jobs, OPEVC, plugins, authority, and verification
  grow.

Origin 1.0 is for one local user. Accounts, remote access, synchronization, and team authority are
outside this version.

## Start

The full harness requires Git, Node.js 22+, tmux, Codex CLI, and an authenticated Codex session.
Windows users run it inside WSL2.

```bash
./scripts/install.sh
npm run origin
```

`npm run origin` performs strict preflight, starts or reuses the live dashboard, opens the browser,
creates or reuses a repository-scoped tmux session, launches interactive Codex, and attaches the
terminal. It stops with exact remediation when any required layer is missing.

Use `npm run origin:resume` to launch Codex with `codex resume --last`. `npm run dashboard` starts
only the development dashboard for diagnostics; it is not the complete Origin interaction model.

The first time Codex opens the repository, use `/hooks`, inspect `.codex/hooks.json`, and trust the
Agent Stop State hook. Origin does not bypass Codex's trust boundary.

## The feedback loop

When feedback arrives, Origin saves the authoritative thread first and then records a wake event.
The wake prompt contains only a stable feedback ID, route, and unique delivery marker, never the raw
body. A successful dashboard save may still show a pending wake. If Codex is idle, the prompt is
submitted; if Codex is busy, it is queued without interrupting the current tool call. Nonterminal
wakes are never evicted to limit history, and retry requests attempt delivery immediately. Both
dashboard events and direct terminal conversation reach the same interactive Codex session.

Every voice explains why its plugin fired, which objective is being protected, where authoritative
context lives, what kind of work comes next, and what evidence opens the next boundary. See
[internal voice design](docs/VOICE-DESIGN.md).

```bash
npm run feedback -- next
npm run feedback -- get <id>
npm run feedback -- start <id>
npm run feedback -- interpret <id> <classification> "Interpretation"
npm run feedback -- comment <id> "Progress visible to the user"
npm run feedback -- ask <id> "Question for the user"
npm run feedback -- review <id> "What changed and how it was verified"
npm run agent-state -- get
```

The agent may mark work `ready_for_review`; the agent CLI does not expose acceptance, dismissal, or
review-based reopening. Those actions live on the dashboard review surface, are recorded atomically
with the user's review message, and wake the same Codex session. This is a deliberate capability and
audit boundary inside one trusted local account—not a security boundary against a malicious process
running as that operating-system user. Waiting permits Stop only when no other runnable feedback
remains.

## Other CLI agents

This release is the Codex edition. Claude Code, Qwen Code, OpenCode, and other agents should treat
the repository as an architectural specimen. Their adapter must reproduce persistent interactive
session ownership, event injection, busy/idle behavior, delivery verification, voice selection,
Stop/waiting semantics, recovery, and agent-to-dashboard questions. Replacing one executable name
does not constitute a compatible port.

## Verify

```bash
npm run check
npm run doctor
npm audit --omit=dev --audit-level=high
```

CI proves deterministic lifecycle, schema, hook, tmux-adapter, outbox, API, UI, accessibility,
build, and smoke behavior. Authenticated Codex/tmux execution is a separate local acceptance check;
CI never claims credentials or a real user session it does not possess.

See [installation](INSTALL.md), [security](SECURITY.md), [quality evidence](docs/QUALITY.md), and
the [live acceptance contract](docs/CODEX-ACCEPTANCE.md).

Origin is MIT licensed.
