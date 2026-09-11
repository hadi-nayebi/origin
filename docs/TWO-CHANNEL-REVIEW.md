# Independent engagement channels: review record

Status: implementation draft; not approved for merge or live deployment.

The feature was researched against multiple private and public prototypes. This implementation
contains generic original code, not credentials or personal agent machinery. Two independently
removable channel plugins use a neutral lifecycle library and separate state/journals. Dashboard
audio remains later work.

The user requested at least five review/fix iterations of this PR. Each iteration records its
concrete findings, fixes and validation here. Passing automated checks does not establish zero
defects.

## Acceptance still required

- Dedicated-bot acceptance of automatic reply threading, the complete media matrix, and owner
  callback rejection/acceptance. The authorized shared-bot test has ended.
- Fresh-machine model installation, owner sample enrollment and listening review, and live
  disconnect/restart recovery. Existing local models and an authorized owner reference were used for
  the real inference test.
- The full dashboard question/answer/review/reopen sequence in `CODEX-ACCEPTANCE.md`, plus live
  independent pauses and physical removal. Hook OR behavior and idle wake were tested interactively;
  removal, pauses and lifecycle transitions also have deterministic regression tests.
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

## Iteration 4 — voice enrollment and worker lifecycle

Found: enrollment saved the sample without queuing the promised preview; an old worker exit could
clear a replacement worker; a hung worker could outlive its request timeout; model downloads lacked
exact revision receipts.

Fixed: sample enrollment durably queues one cloned-voice preview, with idempotent replay and a
conversation for owner corrections. Worker shutdown rejects pending requests, isolates old exits and
escalates termination. Downloads resolve and record exact model revisions; explicit pronunciation
overrides retain canonical captions. Doctor fails when voice prerequisites are missing. The sample
integration test runs real FFmpeg conversion with a synthetic fixture and mocked speech; it is not
evidence of voice-clone perceptual quality or actual model inference.

## Iteration 5 — public clone, integration and documentation

Found: old diagnostics and instruction layers still described one global state; removing dashboard
engagement left a misleading feedback control; a reply arriving during slow transcription could form
a separate thread; synchronous tmux observation could block the Telegram polling event loop; startup
lacked listener readiness evidence.

Fixed: schemas, instructions, wiki, diagnostics and UI now describe/use the independent channels.
Raw inputs acquire thread identity before media processing, with replay-safe journal writes, and
pending media prevents premature review. tmux observation runs in a separate worker. The launcher
checks listener ownership and startup readiness. Stop coaching belongs to each channel's voice
catalog. Additional tests cover a physically removed dashboard plugin's HTTP server, ingress crash
replay, slow-media threading and channel-owned Stop voices.

Automated evidence at this stage: Node lifecycle/transport/API regressions, React checks, production
build/smoke, plugin manifest validation and Python syntax checking. The final head's exact test
counts and CI results are recorded in the PR handoff. These checks use fake Telegram/model
boundaries unless explicitly labeled otherwise.

## Additional live-test iteration — GPU contention

A real local Qwen render succeeded, then an attempted longer reply encountered a GPU already
occupied by a separate application. No message from that failed attempt was sent, and the
pre-existing bot consumer was restored. This exposed a resource-handling gap beyond the five
automated review passes.

The worker now checks free CUDA memory before loading, reports a retryable `GPU_BUSY` state,
releases its own failed allocations after an out-of-memory error, and uses SDPA attention. Speech
chunks default to 300 characters. It never interrupts another application's GPU process. The
portable CPU path produced a real cloned-voice render with local ASR alignment 1.0; the voice and a
neutral attachment were delivered through the actual Bot API using private test binding. An incoming
owner voice note was downloaded and transcribed locally. It arrived without a reply-to reference, so
its thread was explicitly associated with the test parent; this does not claim live automatic reply
correlation or callback acceptance. The original bot consumer was restored, the test listener
disabled, and its temporary token copy removed. No bot identity, token, sample or model is
published.

## Additional interactive-test iteration — idle editor detection

Real Codex 0.154.0 testing on Linux found that the empty-editor placeholder and status footer were
being mistaken for an owner draft, preventing idle wakes. The transport now inspects terminal
styling to distinguish dim placeholder text from actual input, rejects unavailable editors, and
preserves identically worded owner drafts. Regression coverage includes true-color escape sequences
and proves that no paste or Enter happens when a draft is present.

In an isolated authenticated Codex tmux session with synthetic local states and no bot credentials,
both exact project hooks were reviewed and trusted through the normal UI. The repository-scoped
transport submitted a uniquely marked wake. The real host blocked Stop for both active channels,
then for Telegram alone with dashboard waiting, then dashboard alone with Telegram waiting. With
both waiting, the next bounded prompt completed without a Stop block. The isolated session was
closed and its synthetic Telegram activation removed. This is bounded host acceptance, not
certification of every onboarding, media or operating-system scenario.
