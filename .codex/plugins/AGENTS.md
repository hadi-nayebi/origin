# Plugin boundary

Every visible plugin owns one coherent cognitive objective. Its public commands are stable
integration surfaces; internal libraries and raw state files are not. Each plugin documents its
capability, exclusions, state, operations, failure behavior, and tests.

Each plugin also owns the vocabulary of its voices. Every fireable voice must map to a real event
and restate the plugin objective in the language relevant to that moment. Include the event's
meaning, authoritative context source, next cognitive operation, authority boundary, and exit
condition. Test that every emitted voice ID exists, renders with bounded inserts, and does not
substitute coaching for deterministic enforcement.
