# Independent engagement channels: review record

Status: implementation draft; not approved for merge or live deployment.

The feature was researched against multiple private and public prototypes. This implementation
contains generic original code, not credentials or personal agent machinery. Two independently
removable channel plugins use a neutral lifecycle library and separate state/journals. Dashboard
audio remains later work.

The user requested at least five review/fix iterations of this PR. Each iteration will record its
concrete findings, fixes and validation here. Passing automated checks does not establish zero
defects.

## Acceptance still required

- Dedicated paired bot: text, reply threading, all supported media, owner rejection.
- Local model installation, owner sample enrollment, cloned-voice preview and listening review;
  disconnect and restart recovery.
- Authenticated interactive Codex with the exact trusted hooks: either channel active, both active,
  independent pauses, physical removal, and idle wake.
- No merge until review and acceptance evidence have been considered by the owner.

## Iteration 1 — independent continuation and local ownership

Found: raw media still being processed and undelivered questions could leave Telegram's projection
idle/waiting; an old lock could be stolen solely by age; private media directories could traverse a
symbolic parent.

Fixed: Telegram derives continuation from both its journal and transport backlog, with independent
pause precedence; the listener reconciles that projection and exits after disable. State locks
require a dead local owner before reclamation. Private directory creation rejects symbolic
ancestors. The hook checks activation's boolean value. Physical-removal tests cover each plugin as
the sole remaining channel; additional tests cover backlog continuation and directory containment.
