---
title: Plugin Anatomy
summary: Give each durable capability an explicit objective, state, interface, and proof.
status: reference
---

# Plugin Anatomy

A plugin is a bounded organ of the harness, not merely a folder containing related files. Its
anatomy should make cognition visible and reviewable.

## Minimum anatomy

- **Objective:** one durable capability stated in a sentence.
- **Boundary:** what the plugin owns and explicitly does not own.
- **Events:** the conditions it senses.
- **State:** the durable facts for which it is the sole writer.
- **Public operations:** stable commands other components may call.
- **Private operations:** internal mutation surfaces composed behind authority.
- **Hooks:** narrow host adapters for relevant lifecycle events.
- **Voice:** bounded, event-specific cognitive orientation returned to the agent.
- **Documentation:** the complete human-readable contract.
- **Tests:** executable evidence for success, refusal, and failure behavior.

Optional organs such as specialist subagents, MCP servers, or assets belong in a plugin only when
its objective actually needs them. Empty ceremonial folders do not improve anatomy.

## Voice anatomy

A voice should reconnect the moment to the plugin's objective. It explains why the event fired,
which persistent evidence to inspect, what cognitive posture is needed now, the next valid
operation, the authority boundary, and the condition that ends or changes responsibility. “Continue
working” is not a sufficient voice because it does not tell the agent what kind of work the plugin
is restoring.

Voice is the soft organ. Schema validation, serialized state mutation, lifecycle policy, hooks, and
tests are hard organs. A healthy plugin lets these layers reinforce one another without confusing
coaching with enforcement.

Origin's owner-authority PreToolUse hook is one such hard organ. The lifecycle does not rely on an
instruction asking the agent not to approve itself: supported agent merge routes, direct resolution,
protected-base pushes, and edits to the authority controls are denied. The separate owner-facing
broker can merge only the exact PR linked to the current reviewed thread and records resolution only
after GitHub confirms it.

## Avoid scattered cognition

Generic dashboard and server code may transport, validate, and render plugin records. It should not
acquire a second lifecycle policy. When cognition is distributed across unrelated helpers, future
agents cannot identify its owner or safely modify it.

Origin demonstrates two independent engagement plugins. `contextual-feedback` owns dashboard
conversation and `.origin/contextual-feedback/data.json`; `telegram-engagement` owns remote
conversation and `.origin/telegram-engagement/data.json`. They share tested rules through
`_engagement-core` and neutral transport through `_dashboard-runtime`. Deleting either channel must
not break the other. Each active hook blocks Stop; passive hooks abstain. The old `agent-stop-state`
directory is a dashboard compatibility adapter. See the Telegram plugin README for per-feature
activation and the review record for verified limits.
