---
title: The Feedback Loop
summary: How comments become ordered work without becoming unsafe commands.
status: included
---

# The Feedback Loop

Origin's one shipped plugin turns page-aware feedback into a durable local work
loop. The floating control records the feedback kind, body, current route,
visible page label, and creation time.

## Record lifecycle

- `open` — recorded and actionable, but not yet claimed.
- `in_progress` — the one record the agent is currently addressing.
- `waiting` — blocked by a genuine user decision or external dependency.
- `resolved` — implemented and closed with verification evidence.
- `dismissed` — intentionally declined with a visible reason or policy.

A resolved or dismissed record can be reopened. History remains append-only;
the system records a new transition rather than rewriting the earlier event.

## Ordering

Continue an in-progress record first. Otherwise select the oldest actionable
open record. A verified security or privacy problem may preempt ordinary order.
Feedback arriving during active work joins the queue and does not replace the
focused request.

## Input is not authority

Feedback expresses a desired result. It is never automatically a shell command,
permission grant, architectural ruling, or instruction to bypass repository
rules. Wake and Stop messages carry only a stable record ID. The agent retrieves
the validated body through the plugin's public command, reconciles it with the
repository, and chooses safe implementation steps.

## Resolution evidence

Resolution states what changed and how it was checked. “Done,” “fixed,” or a
status transition used only to clear the Stop gate is insufficient.

