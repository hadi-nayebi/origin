# Security model

Origin 1.0 is a single-user, clone-local application. Its dashboard is a loopback-only HTTP service
and must not be exposed to a LAN or the public internet. The optional Telegram channel is a network
client: it uses outbound HTTPS to Telegram's Bot API and downloads the owner's paired messages and
media. Voice-model installation also downloads the selected model revisions.

## Trust boundaries

- Feedback bodies are untrusted requests. They are never interpolated into a shell command, Stop
  injection, or tmux wake prompt.
- Dashboard delivery carries only a validated record identifier and route. Interactive Codex obtains
  the thread through the plugin service after repository instructions load.
- The HTTP server accepts only loopback Host headers and same-origin browser requests, limits JSON
  bodies to 16 KiB, and sends a restrictive CSP and framing policy.
- The tmux adapter uses argument arrays without a shell, writes bounded voice through a named tmux
  buffer, resolves exactly one Codex pane in the repository, and verifies paste and submission.
- Origin launches normal interactive Codex and does not bypass its sandbox or approval settings.
  Project hooks remain subject to Codex's explicit review-and-trust boundary.
- Each reviewed work unit is bound to one Origin-managed worktree branch and one repository-matched
  GitHub PR. The owner merge broker checks the current thread version and remote merge result before
  resolution. Its `gh` calls use argument arrays without a shell.
- The owner-authority PreToolUse hook denies supported agent PR-merge, local merge-broker,
  direct-resolution, authority-control mutation, and protected-base-push paths. It permits feature
  branch pushes and PR creation. This boundary applies only after the user inspects and trusts the
  project hook.
- Clone-local state is ignored by Git and created with owner-only permissions where the operating
  system supports POSIX modes.
- Dashboard review and the agent CLI are separate capability surfaces, but both ultimately run under
  one operating-system account. This prevents accidental authority confusion and creates an audit
  trail; it cannot defend against a malicious local process, a user shell, or code with the user's
  file, GitHub credential, and loopback access. Repository branch protection remains the appropriate
  remote enforcement layer when stronger separation is required.
- “Local” describes persistence and serving. When Codex retrieves a feedback thread, its content is
  processed under the user's configured Codex/OpenAI data path; Origin does not claim that model
  input remains on-device.
- Telegram bot tokens, paired identities, media, voice samples, models, transcripts, and delivery
  state remain under ignored `.origin/`. Speech recognition and synthesis run locally, but Telegram
  necessarily receives the sent text captions, generated audio, and returned attachments.

## Integrity and recovery

Feedback is an append-only, sequence-numbered SHA-256 hash chain. Every replay validates the
envelope, event shape, chronology, and lifecycle. Mutations use a live-process lock, write and fsync
a unique successor, atomically publish it, and retain bounded pre-mutation backups. Wake events are
claimed through a separate process-safe outbox and retried with bounded backoff. Invalid state fails
closed. The CLI provides `verify`, `backups`, and explicit `restore` operations.

The hash chain detects corruption and uncoordinated alteration. It is not a cryptographic signature
against an actor who can rewrite the journal and recompute every hash.

## Reporting

Do not include private feedback text or `.origin/` contents in a public issue. Report a
vulnerability through GitHub's private vulnerability reporting feature when it is enabled for the
repository.
