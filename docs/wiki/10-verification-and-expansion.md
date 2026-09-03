---
title: Verify and Expand
summary: Finish work honestly and add complexity only when repeated needs justify it.
status: growth-pattern
---

# Verify and Expand

“Files changed” is not completion. Verification should match the consequence of the work.

## Evidence ladder

- Static checks establish shape and type correctness.
- Unit tests establish bounded policy behavior.
- Integration tests establish component relationships.
- Browser checks establish the actual human-visible result.
- Restart checks establish durable recovery.
- Real host checks establish that registered hooks or adapters truly fire.

Origin runs unit, corruption, migration, rollback, recovery, multiprocess, subprocess, API,
DOM-interaction, Markdown, and accessibility checks through `npm run check`. Its CI repeats that
contract on Linux, macOS, and Windows; `npm run doctor` diagnoses the local checkout and agent
command.

Resolution evidence should name the relevant level and observed result. A link or screenshot may
help review but does not substitute for an explanation.

## Expansion triggers

- Add a general job system when several feedback records require coordinated multi-session work.
- Extract generic agent activity state when more than one cognition can require continued work.
- Add identity when actions must be attributed to different people.
- Add synchronization when multiple clones need shared current state.
- Add authority controls when some users may perform operations others may not.
- Add plugin protection when mature cognition needs deterministic resistance to accidental
  modification.

Each expansion should preserve a migration path, failure behavior, and a clear owner. The empty
foundation stays valuable only if growth remains deliberate.
