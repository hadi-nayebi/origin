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

## Iteration 2 — thread association and crash replay

Found: associating an input left a duplicate active source responsibility; reply commit recovery
could become stale after the journal write but before its receipt.

Fixed: an atomic association event preserves both histories, moves responsibility to the parent,
invalidates prior acceptance and follows the parent on future replies. The source's displayed
resolution follows the parent. Both channel CLIs can associate conversations. Stable outbound
message IDs make question/review commits replayable without duplicated messages. Tests exercise
source-to-parent resolution, further replies, repeated association and lost commit receipts.

## Iteration 3 — side effects and delivery evidence

Found: repeated Enter presses and age-based wake reclamation could submit a wake twice; editor
clearing alone was too weak as acknowledgment. Attachment send uncertainty also lacked a supported
operator recovery operation.

Fixed: one Enter per attempt, unique-marker submission evidence, preservation of existing editor
input, and a durable indeterminate boundary before paste. Dead owner recovery applies only before
side effects. Both Telegram delivery parts and channel wake intents require recorded operator
evidence to retry after an unknown outcome. Review acceptance is unavailable until the complete
reply package is sent. Fake-transport tests cover uncertain outcomes; live Codex acceptance remains
a separate requirement because terminal rendering varies by CLI version.
