---
title: The Feedback Loop
summary: How comments become ordered work without becoming unsafe commands.
status: included
---

# The Feedback Loop

Origin's one shipped plugin turns page-aware feedback into a durable local work loop. The floating
control records the feedback kind, body, current route, visible page label, and creation time.

## Record lifecycle

- `open` — recorded and actionable, but not yet claimed.
- `in_progress` — the one record the agent is currently addressing.
- `waiting` — blocked by a genuine user decision or external dependency.
- `resolved` — implemented and closed with verification evidence.
- `dismissed` — intentionally declined with a visible reason or policy.

A resolved or dismissed record can be reopened. A focused record emits heartbeats during long work;
if its owner disappears, bounded stale recovery returns it to `open` without claiming it was
completed. History remains append-only; the system records a new transition rather than rewriting an
earlier event.

## Ordering

Continue an in-progress record first. Otherwise select the oldest actionable open record. A verified
security or privacy problem may preempt ordinary order. Feedback arriving during active work joins
the queue and does not replace the focused request.

## Wake and continuation

Submitting actionable feedback starts one repository-local headless delivery runner. The runner
invokes the configured CLI without a shell and gives it only the validated record ID. The full
request remains in plugin-owned state. The runner continues through the queue, retains its
single-runner lease during bounded retry backoff, and writes output to `.origin/agent.log`.

Inside an active Codex session, the Stop hook independently blocks exit while actionable work
remains. If the agent command is unavailable, feedback stays durable and the dashboard reports the
delivery problem as retrying or unavailable instead of losing work. After the command is configured,
`npm run feedback -- wake` resumes delivery.

## Input is not authority

Feedback expresses a desired result. It is never automatically a shell command, permission grant,
architectural ruling, or instruction to bypass repository rules. Wake and Stop messages carry only a
stable record ID. The agent retrieves the validated body through the plugin's public command,
reconciles it with the repository, and chooses safe implementation steps.

## Resolution evidence

Resolution states what changed and how it was checked. “Done,” “fixed,” or a status transition used
only to clear the Stop gate is insufficient.

## Integrity and recovery

Events form a sequence-numbered SHA-256 chain. Every replay verifies the chain, event shapes,
chronology, legal transitions, and the single-focus invariant. Writes are atomic and keep bounded
backups. The public CLI can verify, migrate, list backups, and restore a selected valid snapshot.
