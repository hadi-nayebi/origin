# Security model

Origin 1.0 is a single-user, clone-local application. It is not a network service and must not be
exposed to a LAN or the public internet.

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
- Clone-local state is ignored by Git and created with owner-only permissions where the operating
  system supports POSIX modes.

## Integrity and recovery

Feedback is an append-only, sequence-numbered SHA-256 hash chain. Every replay validates the
envelope, event shape, chronology, and lifecycle. Mutations use a live-process lock, write and fsync
a unique successor, atomically publish it, and retain bounded pre-mutation backups. Wake events are
claimed through a separate process-safe outbox and retried with bounded backoff. Invalid state fails
closed. The CLI provides `verify`, `backups`, and explicit `restore` operations.

## Reporting

Do not include private feedback text or `.origin/` contents in a public issue. Report a
vulnerability through GitHub's private vulnerability reporting feature when it is enabled for the
repository.
