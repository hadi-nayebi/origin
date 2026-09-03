---
title: The Contextual Feedback Loop
summary: How a dashboard comment becomes durable conversation, work, verification, and user review.
status: included
---

# The Contextual Feedback Loop

Origin saves a comment before trying to wake Codex. The saved thread is authoritative; tmux is only
the transport into the same interactive session the user sees in the terminal.

## Lifecycle

- `open` — actionable and ordered.
- `in_progress` — the one current focus.
- `waiting` — blocked on recorded input while no other runnable work remains.
- `ready_for_review` — implemented and verified by the agent, awaiting the user.
- `resolved` — accepted by the user.
- `dismissed` — explicitly withdrawn, not silently erased.

Every state transition remains in the journal. User answers, agent questions, interpretations,
progress, and review comments stay in the thread. Raw user language is never replaced by the agent's
summary.

## Same-session delivery

The runtime finds exactly one Codex pane for this repository. It pastes a bounded voice message
containing a feedback ID and route. If Codex is busy, the message enters Codex's deferred input
queue without interrupting the current tool call. Delivery is serialized, verified, and recorded in
a durable outbox so terminal interruption does not erase responsibility.

## Stop and waiting

Contextual Feedback reconciles its complete queue into `agent-stop-state`. Runnable work means
`active`. Review or a genuine missing input means `waiting` only when no other runnable item exists.
No responsibility means `idle`. A user pause is distinct from completion.
