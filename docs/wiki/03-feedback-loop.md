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
- `ready_for_review` — implemented and verified by the agent, with exactly one linked PR awaiting
  the user.
- `resolved` — the linked PR was merged through an owner action and GitHub confirmed the merge.
- `dismissed` — explicitly withdrawn, not silently erased.

Every state transition remains in the journal. User answers, agent questions, interpretations,
progress, and review comments stay in the thread. Raw user language is never replaced by the agent's
summary.

Actions that change both conversation and lifecycle are one journal event: asking records the
question and waiting state together; answering records the answer and runnable state together;
review records the user's note and reopening or withdrawal together. Merge acceptance records the
confirmed PR and resolution together. Atomic file writes alone are not enough if one human action
could still be split into contradictory business events.

## One thread, one worktree, one PR

An actionable parent thread gets one private `.origin/worktrees/` branch and exactly one GitHub PR.
Related inputs are associated into the existing parent rather than creating competing PRs. The PR
head must match the recorded Origin-managed branch, and the agent must provide verification before
the thread can enter review.

The dashboard's **Merge PR** button and Telegram's paired **Merge PR** button or `/merge NUMBER`
command invoke the same owner broker. It checks the displayed thread version, repository identity,
PR state, draft/conflict status, and GitHub's final merged state. A failed or interrupted merge
leaves the thread open; an already-confirmed remote merge makes retry safe.

There is no agent merge command. A trusted PreToolUse hook denies supported CLI, API, MCP, local
broker, direct-resolution and protected-base-push paths while still allowing branch pushes and PR
creation. Because all local processes run as the same operating-system user, this is deterministic
within the trusted Codex tool path—not an operating-system sandbox against malicious local code.

## Same-session delivery

The runtime finds exactly one Codex pane for this repository. It pastes a bounded voice message
containing a feedback ID and route. If Codex is busy, the message enters Codex's deferred input
queue without interrupting the current tool call. Delivery is serialized, verified, and recorded in
a durable outbox so terminal interruption does not erase responsibility. Each wake is tied to the
source journal event by sequence and hash and carries a unique marker. Nonterminal wakes are
retained without a count cap; only terminal delivery history is compacted.

The voice is more than “new feedback arrived.” It reminds Codex why raw input is preserved, where to
retrieve authoritative context, how to protect the current focus, what authority remains with the
user, and what evidence moves the thread to its next boundary.

## Stop and waiting

Contextual Feedback reconciles its complete queue into its own
`.origin/contextual-feedback/data.json`. Runnable work means `active`. Review or a genuine missing
input means `waiting` only when no other runnable item exists. No responsibility means `idle`. A
user pause is distinct from completion.
