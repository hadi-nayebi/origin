# Origin dashboard runtime

This underscore-prefixed directory is transport infrastructure, not a cognitive plugin. It may start
the local dashboard, attach one interactive Codex process to a repository-scoped tmux session, and
deliver bounded voice messages from durable events. It must not own feedback policy, agent state,
user authority, or completion.

Resolve exactly one Codex pane whose working directory is this repository. Never interpolate a
feedback body into a shell command. Delivery prompts contain stable identifiers and routes only.
Persist an outbox before delivery, serialize tmux writes, verify paste/submission, and revalidate
the referenced event before retrying.

The runtime renders voices selected by the owning cognitive plugin. It may add a unique delivery
marker, but it must not reduce the voice to a transport notice or author policy about what Codex
should think. Preserve every nonterminal wake regardless of history size; only bounded terminal
delivery history may be compacted.
