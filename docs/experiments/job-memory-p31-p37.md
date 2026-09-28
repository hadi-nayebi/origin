# P31/P37 causal working-memory experiment

This draft-only experiment tests one command-driven, same-session slice of Origin's proposed general
job memory. It is evidence for a later plugin decision, not an installed production job system.

## Why this is not rocket science?

Append-only journals, optimistic revisions, idempotency keys, rebuildable projections, and explicit
lineage are established state-machine techniques. They fit this job because a phase handoff must be
durable, attributable, and stale-safe before the harness can claim that later work used it. The real
open question is whether the stored evidence improves the agent's decisions; storage structure alone
cannot prove semantic understanding.

## What the trace proves

- One active process opens typed Observe, Plan, Execute, and Verify attempts.
- Observe publishes an immutable handoff; delivery and use are separate records.
- The first affected Plan decision cites the delivered handoff.
- Execute and Verify bind to one exact artifact revision and criterion.
- P37 refuses a lineage manifest without Plan, Execute, and Verify evidence.
- An old owner revision fails without partial mutation.
- A late correction invalidates dependents without rewriting earlier attempts.
- A backward repair preserves the failed path and its reason.
- Deleting a projection, closing a dashboard, or removing a channel does not remove the owner journal.

Run the isolated trace:

```bash
node scripts/experiments/job-memory/run-trace.mjs
```

Run the experiment tests:

```bash
node --test scripts/tests/job-memory-experiment.test.mjs
```

## Boundaries

The experiment does not register hooks, write dashboard state, select jobs, control Stop, publish
instructions, migrate existing clone data, call a model, add a second agent, or claim portability to
another runtime. Runtime data stays under ignored `.origin/experiments/`. Caller proof is recorded
but represented by a fixture; production authentication remains unresolved and must fail closed at
the real host boundary.
