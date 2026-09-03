# Security model

Origin 1.0 is a single-user, clone-local application. It is not a network service and must not be
exposed to a LAN or the public internet.

## Trust boundaries

- Feedback bodies are untrusted requests. They are never interpolated into a shell command, Stop
  injection, or agent-launch argument.
- Agent delivery carries only a validated record identifier. The agent obtains the body through the
  plugin service after repository instructions load.
- The HTTP server accepts only loopback Host headers and same-origin browser requests, limits JSON
  bodies to 16 KiB, and sends a restrictive CSP and framing policy.
- The child-process adapter uses `shell: false`. Its command and fixed leading arguments come from
  local operator configuration, never dashboard data.
- The default agent receives a `workspace-write` sandbox. Project hooks remain subject to Codex's
  explicit review-and-trust boundary.
- Clone-local state is ignored by Git and created with owner-only permissions where the operating
  system supports POSIX modes.

## Integrity and recovery

Feedback is an append-only, sequence-numbered SHA-256 hash chain. Every replay validates the
envelope, event shape, chronology, and lifecycle. Mutations use a live-process lock, write and fsync
a unique successor, atomically publish it, and retain bounded pre-mutation backups. Invalid state
fails closed. The CLI provides `verify`, `migrate`, `backups`, and explicit `restore` operations.

## Reporting

Do not include private feedback text or `.origin/` contents in a public issue. Report a
vulnerability through GitHub's private vulnerability reporting feature when it is enabled for the
repository.
