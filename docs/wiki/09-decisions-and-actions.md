---
title: Decisions and User Actions
summary: Separate questions, reviews, permissions, and necessary human operations.
status: reference
---

# Decisions and User Actions

Human involvement has several distinct meanings. Combining them creates unnecessary interruptions
and false authority.

## Question

A question asks the user to resolve a consequential value choice that the agent cannot infer after
exhausting repository evidence and established practice. It should state the alternatives,
consequences, and recommendation.

## Review

A review asks whether presented evidence is sufficient to advance or complete work. It is not
ordinary collaboration input and should not fabricate a new preference question.

## User action

A user action requests one already-governed operation that only the human may perform, such as
trusting a hook or approving a protected transition. State the precondition, exact mutation,
expected result, and failure behavior.

## Permission

Permission authorizes an action; it does not prove the action succeeded. Keep authorization and
verification as separate records.

The agent should not ask the user to confirm routine next steps that are already implied by the
accepted objective. Evidence gathering, implementation judgment, and ordinary verification remain
agent responsibilities.

Origin 1.0 separates the dashboard review surface from the agent CLI: the agent can provide
verification and request review, while acceptance, withdrawal, and review-based reopening are absent
from its public command list. The journal makes that distinction inspectable. Because the dashboard
and Codex run as the same operating-system user, this prevents accidental authority confusion but is
not a security defense against a malicious local process. Stronger identity and role enforcement
belongs to a future multi-user architecture.
