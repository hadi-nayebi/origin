---
title: From Feedback to Jobs
summary: Introduce bounded jobs when a comment queue is no longer enough.
status: future
---

# From Feedback to Jobs

Origin 1.0 uses individual feedback records as its work queue. A general job system is not included.

A job becomes useful when one outcome requires several dependent activities, working memory across
sessions, explicit deliverables, or structured human review. Do not create a job merely to rename
one comment.

## A durable job normally needs

- A bounded objective.
- One owner and one current focus.
- Status distinct from procedural phase.
- Working memory that survives context loss.
- Required outputs and exit checks.
- Attributed user input kept separate from agent memory.
- Completion and reopening evidence.
- A queue that does not silently replace focused work.

Only one job should own focus in a clone. New independent work remains pending until the focused job
completes or an explicit preemption rule applies.

Feedback may create or enrich a job, but the original feedback record remains traceable. Closing the
job does not automatically prove that every linked comment was satisfied.
