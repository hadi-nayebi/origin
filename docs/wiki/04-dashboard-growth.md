---
title: Grow the Dashboard
summary: Add pages and interactions without turning the interface into the system of record.
status: growth-pattern
---

# Grow the Dashboard

A dashboard is the human-facing surface over project state and harness
capabilities. It is not automatically the canonical database, the agent, or the
authority that decides what work means.

## Add structure only when it earns a role

- Add a page when it answers a recurring question or supports a repeated action.
- Add navigation when at least two durable destinations exist.
- Add filtering when the real collection has grown beyond direct scanning.
- Add a database only when file-backed state no longer supports the necessary
  queries, scale, or concurrency.
- Add synchronization only when more than one clone must share state.

## Keep three layers distinguishable

1. **Canonical sources** contain accepted content and definitions.
2. **Runtime state** records current local operation and remains gitignored.
3. **Presentation** renders both without quietly becoming a competing truth.

## Progressive disclosure

Show the most relevant current information first while keeping supporting
detail searchable and accessible. Collapsed presentation must never hide
safety-critical, privacy, or blocking state from the agent or user.

Origin's distributed empty canvas is the first layer. The user's agent owns the
initial proposal, and the user owns consequential choices about what it becomes.

