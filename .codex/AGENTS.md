# Origin harness root

The harness contains shared context, one visible behavior plugin (`contextual-feedback`), one
low-level control plugin (`agent-stop-state`), and underscore-prefixed runtime infrastructure. Keep
their ownership separate: thread lifecycle, global continuation state, and tmux transport are three
different concerns.

Host registrations live in `.codex/hooks.json`. A hook observes or constrains an event but does not
become the owner of the state it reads.

The harness should feel like one coherent internal voice while remaining compartmentalized. Route an
event to the voice owned by the responsible plugin; transport may render and deliver that voice but
must not invent its cognitive instructions. A hard hook explains the objective of its refusal and
the specific valid boundary, while the service and state—not the explanation—remain authoritative.
