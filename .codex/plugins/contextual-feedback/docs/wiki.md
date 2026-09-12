---
title: Contextual Feedback
status: included
---

# Contextual Feedback

This plugin is Origin's first visible behavior. It preserves exactly what the user said, the page
where it was said, later thread messages, the agent's separate interpretation, linked work,
verification, linked PR merge acceptance, and reopening history.

The anatomy is compartmentalized:

| Layer                                      | Owner                     |
| ------------------------------------------ | ------------------------- |
| Feedback lifecycle and thread              | `contextual-feedback`     |
| Dashboard active/waiting/idle/paused state | `contextual-feedback`     |
| Neutral lifecycle/state implementation     | `_engagement-core`        |
| Durable wake and tmux injection            | `_dashboard-runtime`      |
| HTTP validation and rendering              | `server` and dashboard UI |

The agent creates the thread's isolated worktree, links the exact branch PR, provides verification,
and marks the thread ready for review. It has no merge command. The owner closes the claim only by
merging that PR through the dashboard or paired Telegram; the broker records resolution after GitHub
confirms the merge. The owner may instead reopen or withdraw it.

The plugin's voices are its soft cognitive surface. They do not merely announce an event: they
remind Codex why raw input remains separate from interpretation, why current focus should survive
unrelated feedback, why an answer reopens only the blocked decision, and why verification still
requires user review. Lifecycle policy and atomic journal events remain the hard source of truth.
