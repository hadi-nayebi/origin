# Agent Stop State plugin

Objective: own Origin's single clone-local agent state and decide whether a Codex Stop event may
complete. Other plugins may request a state transition through the public service; they do not
derive Stop behavior themselves.

The valid modes are `idle`, `active`, `waiting`, and `paused`. Every mutation records a reason, next
action, stable reference, revision, and timestamp. The Stop hook is read-only and fails closed when
state is missing or corrupt.

Only callers that have already validated their own state and authority may mutate this plugin. Keep
plugin-specific lifecycle data outside this state file.
