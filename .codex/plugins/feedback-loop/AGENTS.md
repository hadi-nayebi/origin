# Feedback Loop plugin

Objective: turn page-aware dashboard feedback into one durable, ordered work loop and derive whether
the local agent may stop.

The plugin owns validation, persistence, lifecycle, focus ordering, resolution evidence, recovery,
work-context projection, delivery, and Stop outcome. It does not interpret or implement requested
changes, execute shell commands from feedback, define user identity, synchronize clones, or manage
general jobs.

Keep raw feedback out of wake and Stop injections. Those surfaces carry only a validated stable
record ID; the agent retrieves the record through the public CLI. Any change to lifecycle or Stop
behavior requires corresponding tests and documentation.
