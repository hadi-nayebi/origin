---
title: Plugin Anatomy
summary: Give each durable capability an explicit objective, state, interface, and proof.
status: reference
---

# Plugin Anatomy

A plugin is a bounded organ of the harness, not merely a folder containing
related files. Its anatomy should make cognition visible and reviewable.

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

## Avoid scattered cognition

Generic dashboard and server code may transport, validate, and render plugin
records. It should not acquire a second lifecycle policy. When cognition is
distributed across unrelated helpers, future agents cannot identify its owner
or safely modify it.

Origin 1.0 demonstrates a compact anatomy through `feedback-loop`. More mature
systems may add protection masks, activation review, trust evidence, and
controlled maintenance, but those mechanisms should follow demonstrated need.

