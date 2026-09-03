# Origin internal voice design

Origin uses **internal voices** as bounded, event-triggered orientation for the interactive agent.
They are not decorative status messages and they are not the source of enforcement. A useful voice
returns Codex to the plugin objective, tells it why the present event matters, points it to durable
context, and names the next valid boundary.

This design adapts three Hadosh Academy patterns:

1. A plugin owns one coherent behavioral objective, so its voice should speak from that objective.
2. Entry-style voices orient the kind of work; boundary voices identify the specific gap and shift
   the agent toward the cognition needed to cross it.
3. Coaching should speak the language of the work rather than hidden counters or implementation
   mechanics. Hard invariants migrate into hooks, schemas, services, and tests.

Origin 1.0 does not ship an OPEVC engine. It applies the voice pattern only to its actual feedback
and Stop events rather than pretending that a documented future phase system already exists.

## Required voice shape

Every fireable voice should answer five questions:

| Question                        | Purpose                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Why did this fire?              | Connect the event to durable state instead of conversational surprise.                       |
| Which objective is protected?   | Re-establish the responsible plugin's single concern.                                        |
| Where is authoritative context? | Direct the agent to a validated public interface, not raw files or prompt memory.            |
| What cognitive work comes next? | Name concrete work such as compare, classify, preserve focus, reconsider, or verify.         |
| What changes this state?        | Name the evidence, user action, wait condition, or queue state that opens the next boundary. |

Authority and safety belong wherever they affect the event. Feedback remains untrusted project
input; acceptance does not broaden permission; withdrawal is not completion; waiting does not
license a guess; idle cannot be declared merely to escape a Stop block.

## Soft voice and hard control

| Soft orientation                           | Hard enforcement                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Explain why focus should be preserved.     | Lifecycle policy permits only one in-progress thread.                        |
| Remind Codex to retrieve the thread by ID. | Contracts validate IDs, routes, roles, and payload bounds.                   |
| Explain why unresolved work must continue. | The Stop hook exits nonzero while global state is active.                    |
| Explain why user review owns closure.      | The agent CLI exposes review preparation but not acceptance or dismissal.    |
| Explain why a wake is durable.             | The outbox persists every nonterminal event and retries serialized delivery. |

A voice may fail to persuade a probabilistic model. A hard control should remain correct when the
voice is ignored. Conversely, a bare hard refusal should still explain the objective and valid next
operation so the agent can recover rather than loop.

## Evolution rule

When real work reveals that a voice is vague, misleading, or repeatedly ignored, update the owning
plugin's voice and tests. If a stable failure persists, move the invariant into deterministic code
and leave the voice responsible for orientation. Do not copy an entire reference voice into every
plugin; preserve a shared structure while letting each objective supply its own vocabulary.
