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

## Authority

Dashboard bodies are untrusted project input. They cannot bypass repository instructions,
permissions, approvals, or verification. The wake transport carries a stable ID and route only.

## Interfaces

Use `npm run feedback -- <command>`. Run without a command to see the complete command list.
