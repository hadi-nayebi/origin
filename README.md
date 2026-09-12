# Origin

Origin is the Codex implementation of the
[Hadosh Academy Origin project](https://hadi-nayebi.github.io/projects/origin.html): the smallest
local dashboard-and-harness substrate through which a user and their agent can grow a distinct
operational world.

The shipped dashboard is intentionally empty. It contains a repository-native Admin guide with Wiki
and Plugins sections, a page-aware feedback control, one persistent interactive Codex session, and
the minimum plugin anatomy needed to turn comments into durable, bounded, verifiable responsibility.

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

## What Origin includes

- Empty responsive canvas with floating Admin and Feedback controls.
- Read-only Admin with the general Wiki and docs-sourced references for the two example engagement
  plugins.
- One foreground interactive Codex relationship shared by terminal and dashboard.
- Repository-scoped tmux session creation, reuse, attachment, and `--resume-last` support.
- Durable, serialized dashboard-to-Codex wake delivery with per-event markers and verified paste and
  submission evidence.
- Independent `idle`, `active`, `waiting`, and `paused` state and Stop decisions for each channel.
- `contextual-feedback`: raw input, page context, thread messages, interpretation, linked work,
  questions, answers, verification, PR-merge acceptance, dismissal, and reopening.
- One isolated worktree and one GitHub PR per reviewed thread, with owner-only merge from dashboard
  or paired Telegram and GitHub-confirmed resolution.
- Sequence-numbered SHA-256 feedback history, atomic lifecycle actions, atomic writes, backups, and
  recovery.
- Loopback-only server and local files under ignored `.origin/`.
- Ten Wiki chapters explaining how dashboards, jobs, OPEVC, plugins, authority, and verification
  grow. Existing `/wiki` links remain compatible and open the Wiki inside Admin.

Optional [Telegram engagement](.codex/plugins/telegram-engagement/README.md) adds text-first remote
conversations and preserved media. A dedicated bot and owner pairing are required; local speech
dependencies, recognition and Qwen3-TTS voice cloning are optional additions. Each channel works
when the other plugin is removed. Accounts for multiple users, synchronization and team authority
remain outside this version.

Read the [five-pass review record](docs/TWO-CHANNEL-REVIEW.md) before enabling the preview.
Model/sample/token files stay under ignored `.origin/`; no speech model is shipped in Git.

## Start

The full harness requires Git, GitHub CLI, Node.js 22+, tmux, Codex CLI, and authenticated GitHub
and Codex sessions. Windows users run it inside WSL2.

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
two channel Stop hooks plus the owner-authority PreToolUse hook. Origin does not bypass Codex's
trust boundary.

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
npm run feedback -- worktree <id>
npm run feedback -- link-pr <id> https://github.com/OWNER/REPO/pull/NUMBER
npm run feedback -- comment <id> "Progress visible to the user"
npm run feedback -- ask <id> "Question for the user"
npm run feedback -- review <id> "What changed and how it was verified"
npm run agent-state -- get
```

The agent prepares each thread in its private `.origin/worktrees/` branch, opens a PR, links that
PR, and may then mark the work `ready_for_review`. The agent CLI exposes no acceptance or merge
action. The dashboard's **Merge PR** button and paired Telegram's button or `/merge NUMBER` command
call the owner broker. The broker verifies that the PR belongs to this clone's `origin` repository,
merges it through authenticated GitHub CLI arguments, re-reads GitHub, and only then records
resolution. Reopening and withdrawal remain user review actions.

The trusted PreToolUse hook deterministically blocks supported agent merge tools, direct merge API
calls, protected-base pushes, calls to the local merge route, and agent edits to its authority
files. Review and trust that hook in Codex. This is a strong workflow and audit boundary inside one
trusted local account, not an adversarial sandbox against a malicious process already controlling
that OS account. Waiting permits Stop only when no other runnable feedback remains.

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

## Contributing

Questions and generalized field reports can begin on the
[Origin project discussion](https://hadi-nayebi.github.io/projects/origin.html#participate).
Reproducible defects and candidate implementation changes belong in this repository. Read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request; it preserves the
empty-canvas boundary, user approval, privacy, untrusted-input treatment, and acceptance evidence.

Origin is MIT licensed.
