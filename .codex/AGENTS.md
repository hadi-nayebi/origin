# Origin harness root

The harness has two independent communication plugins, `contextual-feedback` and
`telegram-engagement`, backed by neutral `_engagement-core` policy and runtime transport. Each
channel owns separate histories, continuation state, Stop decisions and wake outboxes. Removing one
plugin must leave the other functional. Shared infrastructure may serialize terminal access; it must
not combine or overwrite channel states.

Host registrations live in `.codex/hooks.json`. A hook observes or constrains an event but does not
become the owner of the state it reads.

The harness should feel like one coherent internal voice while remaining compartmentalized. Route an
event to the voice owned by the responsible plugin; transport may render and deliver that voice but
must not invent its cognitive instructions. A hard hook explains the objective of its refusal and
the specific valid boundary, while the service and state—not the explanation—remain authoritative.
