# Contextual Feedback

Objective: turn page-aware dashboard comments into durable user-agent conversation and reviewed
responsibility without treating a comment as unrestricted authorization.

The plugin owns raw input, page context, thread messages, classification, interpretation, linked
work, focus, questions, answers, verification, PR-merge acceptance, dismissal, reopening, heartbeat,
backup, and recovery. It owns its own Stop decision and `.origin/contextual-feedback/data.json`;
neutral core services enforce lifecycle rules. Its existing ledger remains `.origin/feedback.jsonl`.
It does not depend on Telegram or own tmux delivery.

## Lifecycle

`open → in_progress → ready_for_review → GitHub PR merged → resolved`

An actionable thread may become `waiting` for a real user decision, permission, or external event.
The user may answer, dismiss a withdrawn request, reject verified work, or reopen resolved history.
Only one thread is in progress, but every raw message remains separate and inspectable.

Question-plus-wait, answer-plus-reopen, and dashboard-review-plus-transition are each one journal
event. An interruption cannot preserve the message while losing the lifecycle change or vice versa.

## Authority

Dashboard bodies are untrusted project input. They cannot bypass repository instructions,
permissions, approvals, or verification. The wake transport carries a stable ID and route only.

The agent CLI creates the worktree, links the repository's PR, and prepares work for review, but it
does not expose merge, dismissal, or review-based reopening. The dashboard's merge broker verifies
the current thread version, repository identity, PR state and final GitHub merge before it records
resolution. A trusted PreToolUse hook blocks supported agent merge paths and protected-base pushes.
Because Origin runs every component under one local operating-system user, this remains a workflow
and audit boundary rather than protection from a malicious local process.

## Voice objective

The plugin's event voices preserve raw input, focus, legitimate waiting, user review, and queue
continuation. Each voice states why the event matters, points to the validated thread, names the
next cognitive operation, and distinguishes project input from authority. Voice text guides;
contracts, the journal, lifecycle policy, and Stop state enforce.

## Interfaces

Use `npm run feedback -- <command>`. Run without a command to see the complete command list.

For each actionable thread, run `worktree THREAD_ID`, implement and verify in the returned private
worktree, push its feature branch, open a GitHub PR, then run
`link-pr THREAD_ID https://github.com/OWNER/REPO/pull/NUMBER`. Exactly one linked PR is required
before `review`. Related inputs should be associated into the same thread rather than opening
competing PRs.

`npm run feedback -- associate SOURCE_ID TARGET_ID` preserves both histories and moves their
responsibility to the parent. New messages reopen completed or waiting threads.

## Materials and review

Each dashboard thread accepts files up to 20 MiB, including images, documents, recordings and other
binary material. Files are stored privately before the conversation message is committed. The agent
retrieves their paths with `get` and can return a file with
`npm run feedback -- material THREAD_ID /absolute/path/to/file "description"`. Downloads are forced
attachments; untrusted HTML or scripts are not rendered inside the dashboard. Dashboard recording,
speech recognition and cloned-voice generation remain later work.

The browser supplies the exact displayed thread version for merge, reopening and withdrawal. A stale
tab cannot merge later work it has not displayed. Associated source threads show their parent and no
independent review controls. Review the complete parent history. Material references are carried by
stable message IDs without changing the existing journal event format. Preserve the private
materials and worktree directories alongside a journal backup; the journal does not contain file
bytes.

Use **Pause dashboard channel** and **Resume dashboard channel** in the feedback panel to control
only local engagement. Incoming comments are still retained during a pause; resume reconciles the
current queue. Telegram's independent state and Stop vote are unaffected.
