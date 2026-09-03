# Origin harness root

The harness contains shared context, one visible behavior plugin (`contextual-feedback`), one
low-level control plugin (`agent-stop-state`), and underscore-prefixed runtime infrastructure. Keep
their ownership separate: thread lifecycle, global continuation state, and tmux transport are three
different concerns.

Host registrations live in `.codex/hooks.json`. A hook observes or constrains an event but does not
become the owner of the state it reads.
