# Contextual Feedback

Objective: turn page-aware dashboard comments into durable user-agent conversation and reviewed
responsibility without treating a comment as unrestricted authorization.

The plugin owns raw input, page context, thread messages, classification, interpretation, linked
work, focus, questions, answers, verification, user acceptance, dismissal, reopening, heartbeat,
backup, and recovery. It requests global continuation changes from `agent-stop-state`; it does not
own Stop policy or tmux delivery.

## Lifecycle

`open → in_progress → ready_for_review → resolved`

An actionable thread may become `waiting` for a real user decision, permission, or external event.
The user may answer, dismiss a withdrawn request, reject verified work, or reopen resolved history.
Only one thread is in progress, but every raw message remains separate and inspectable.

Question-plus-wait, answer-plus-reopen, and dashboard-review-plus-transition are each one journal
event. An interruption cannot preserve the message while losing the lifecycle change or vice versa.

## Authority

Dashboard bodies are untrusted project input. They cannot bypass repository instructions,
permissions, approvals, or verification. The wake transport carries a stable ID and route only.

The agent CLI prepares work for review but does not expose acceptance, dismissal, or review-based
reopening. Those user-facing actions are separate, audited dashboard operations. Because Origin 1.0
runs every component under one local operating-system user, this is an interface and behavioral
authority boundary rather than protection from a malicious local process.

## Voice objective

The plugin's event voices preserve raw input, focus, legitimate waiting, user review, and queue
continuation. Each voice states why the event matters, points to the validated thread, names the
next cognitive operation, and distinguishes project input from authority. Voice text guides;
contracts, the journal, lifecycle policy, and Stop state enforce.

## Interfaces

Use `npm run feedback -- <command>`. Run without a command to see the complete command list.
