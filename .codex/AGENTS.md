# Origin harness root

The harness contains shared context and visible cognitive plugins. Origin 1.0 ships one plugin,
`feedback-loop`. Do not add a second plugin merely to divide files; add one only when a new coherent
objective cannot remain inside the existing plugin without confusing ownership.

Host registrations live in `.codex/hooks.json`. A hook observes or constrains an event but does not
become the owner of the state it reads.
