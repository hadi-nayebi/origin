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
- **Voice:** bounded guidance or blocking text returned to the agent.
- **Documentation:** the complete human-readable contract.
- **Tests:** executable evidence for success, refusal, and failure behavior.

Optional organs such as specialist subagents, MCP servers, or assets belong in a plugin only when
its objective actually needs them. Empty ceremonial folders do not improve anatomy.

## Avoid scattered cognition

Generic dashboard and server code may transport, validate, and render plugin records. It should not
acquire a second lifecycle policy. When cognition is distributed across unrelated helpers, future
agents cannot identify its owner or safely modify it.

Origin 1.0 demonstrates two distinct plugin anatomies. `contextual-feedback` owns thread contracts,
policy, integrity, persistence, service operations, event voice, commands, documentation, schema,
and tests. `agent-stop-state` owns its clone-local `data.json`, mutation contract, Stop voice, Stop
hook, commands, documentation, schema, and tests. `_dashboard-runtime` is explicitly infrastructure:
it owns tmux session and delivery mechanics but no cognition. Host registration remains at the
harness root because the host owns registration.

More mature, multi-user systems may add role masks and activation review. Those are deliberately
absent from this one-user foundation rather than being half-implemented inside the plugin.
