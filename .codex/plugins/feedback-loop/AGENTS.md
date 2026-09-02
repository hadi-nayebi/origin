# Feedback Loop plugin

Objective: turn page-aware dashboard feedback into one durable, ordered work
loop and derive whether the local agent may stop.

The plugin owns validation, persistence, lifecycle, focus ordering, resolution
evidence, reopening, work-context projection, and Stop outcome. It does not
interpret feedback as authority, implement requested dashboard changes,
execute shell commands from feedback, define user identity, synchronize
clones, or manage general jobs.

Keep raw feedback out of wake and Stop injections. Those surfaces carry only a
validated stable record ID; the agent retrieves the record through the public
CLI. Any change to lifecycle or Stop behavior requires corresponding tests and
documentation.

