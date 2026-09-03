---
title: Contextual Feedback
status: included
---

# Contextual Feedback

This plugin is Origin's first visible behavior. It preserves exactly what the user said, the page
where it was said, later thread messages, the agent's separate interpretation, linked work,
verification, acceptance, and reopening history.

The anatomy is compartmentalized:

| Layer                                   | Owner                     |
| --------------------------------------- | ------------------------- |
| Feedback lifecycle and thread           | `contextual-feedback`     |
| Global active/waiting/idle/paused state | `agent-stop-state`        |
| Durable wake and tmux injection         | `_dashboard-runtime`      |
| HTTP validation and rendering           | `server` and dashboard UI |

The agent cannot close its own claim. It provides verification and marks a thread ready for review;
the user accepts or reopens it.

The plugin's voices are its soft cognitive surface. They do not merely announce an event: they
remind Codex why raw input remains separate from interpretation, why current focus should survive
unrelated feedback, why an answer reopens only the blocked decision, and why verification still
requires user review. Lifecycle policy and atomic journal events remain the hard source of truth.
