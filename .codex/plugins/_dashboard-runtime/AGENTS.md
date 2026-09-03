# Origin dashboard runtime

This underscore-prefixed directory is transport infrastructure, not a cognitive plugin. It may start
the local dashboard, attach one interactive Codex process to a repository-scoped tmux session, and
deliver bounded voice messages from durable events. It must not own feedback policy, agent state,
user authority, or completion.

Resolve exactly one Codex pane whose working directory is this repository. Never interpolate a
feedback body into a shell command. Delivery prompts contain stable identifiers and routes only.
Persist an outbox before delivery, serialize tmux writes, verify paste/submission, and revalidate
the referenced event before retrying.
