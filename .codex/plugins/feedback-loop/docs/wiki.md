---
title: Feedback Loop
version: 1.0.0
status: stable
objective:
  Turn page-aware feedback into one durable ordered work loop, deliver it locally, and derive
  whether the agent may stop.
---

# Feedback Loop

## Boundary

The plugin owns feedback contracts, lifecycle policy, state integrity, persistence, selection,
recovery, local delivery, work-context projection, and Stop outcomes. The server transports its
operations; it does not duplicate its policy.

The plugin does not interpret or implement a requested change, grant authority, define identity,
synchronize clones, manage general jobs, or expose Origin to a network. It needs no specialist
subagent in this minimal form: the configured CLI agent performs implementation under repository
instructions.

## Anatomy

| Compartment                 | Owned responsibility                                         |
| --------------------------- | ------------------------------------------------------------ |
| `.codex-plugin/plugin.json` | Identity and interface metadata                              |
| `contracts.mjs`             | Input and persisted-event validation                         |
| `policy.mjs`                | Legal transitions, focus, ordering, Stop outcome             |
| `integrity.mjs`             | Event sequence and SHA-256 chain                             |
| `store.mjs`                 | Locking, atomic publication, migration, backup, restore      |
| `service.mjs`               | Sole public mutation and query gateway                       |
| `delivery.mjs`              | Single-runner lease and shell-free CLI invocation            |
| `voice.xml` / `voice.mjs`   | Stable agent-facing language                                 |
| `hooks/stop.mjs`            | Exact Codex Stop adapter                                     |
| `scripts/feedback.mjs`      | Operator and agent CLI adapter                               |
| `tests/`                    | Success, refusal, corruption, contention, and recovery proof |

## Events and lifecycle

Dashboard submission and server startup are delivery sensors. Records begin `open`. One record may
become `in_progress`; it can heartbeat, become genuinely `waiting`, resolve with evidence, or be
dismissed with a reason. Waiting work can resume. Resolved or dismissed work can reopen. A stale
focused record can recover to `open` with an explicit recovery event.

Continue the focused record first; otherwise take the oldest open record. Actionable work blocks
Stop. Waiting work permits the turn to stop without inventing the missing input. Idle passes
silently.

## Persistence and recovery

`.origin/feedback.jsonl` is an append-only v2 event chain. Each event contains a monotonic sequence,
previous hash, and its own hash. Replay validates the chain, event shape, chronology, transitions,
and the single-focus invariant. Existing v1 ledgers are read compatibly and migrated atomically
before the next write or through the `migrate` command.

Each mutation holds a live-process lock, rereads current state, validates the proposed event, writes
and fsyncs a unique successor, and atomically publishes it. A bounded pre-mutation backup supports
explicit validated restoration. Invalid state is preserved and fails closed.

## Delivery and trust

New actionable feedback starts one detached, headless repository-local runner. The runner invokes
`codex exec --ephemeral --sandbox workspace-write` without a shell and renders its stable operating
guidance from `voice.xml`, supplying only the validated record ID. Ephemeral execution prevents
automatic retries from filling the user's saved session history. The runner keeps draining the
queue, retains its single-runner lease during backoff, and retries both unsuccessful attempts and
successful processes that make no progress. Output is written to `.origin/agent.log`; bounded status
is exposed through the dashboard, and the previous log rotates after 1 MiB. The Stop hook is a
second deterministic barrier inside an active Codex run.

Codex requires explicit trust for project hooks. Review this hook with `/hooks` in the first Codex
session; Origin does not bypass that host security boundary. The host registration resolves from the
Git root and is tested from a nested working directory on every supported operating system.

The operator may disable automatic launch with `ORIGIN_AGENT_AUTOSTART=0` or configure another local
command with `ORIGIN_AGENT_COMMAND` and the bounded JSON string array `ORIGIN_AGENT_ARGS_JSON`.
These values are local operator authority, never feedback-derived input.

Automated tests use deterministic local processes. `npm run acceptance:codex` is the distinct,
opt-in proof that a real authenticated Codex process can retrieve and resolve a record in an
isolated temporary repository. Project-hook trust remains an explicit manual host decision.

## Verification

The repository test suite exercises lifecycle refusal, evidence requirements, hash tampering,
migration, backup restoration, stale recovery, parallel writers, competing focus claims, runner
ownership, a real child process, exact Stop protocols, HTTP policy, DOM interaction, Markdown, and
accessibility. The plugin manifest passes the canonical Codex validator. CI repeats the release
contract on Linux, macOS, and Windows.
