# Dashboard Runtime

Origin's runtime starts the local dashboard and one persistent interactive Codex session. tmux is
the session and injection transport; it is not the source of truth. Dashboard mutations are saved
before a wake is attempted, and the durable outbox survives terminal or server interruption. On
startup, actionable feedback revisions without a corresponding wake record are reconstructed before
delivery resumes, closing the persistence-to-notification crash window.

Every wake carries the owning feedback journal event's sequence and hash plus a unique delivery
marker. Pending, retrying, and claimed events are retained without a count limit; only completed or
cancelled delivery history is bounded. A manual retry cancels scheduled backoff and attempts
delivery immediately. Starting a new interactive session creates a resume orientation when runnable
feedback exists but no wake is pending.

The runtime does not write cognitive instructions. It renders the voice owned by Contextual
Feedback, adds transport evidence, and records whether the specific prompt was pasted and submitted.
See `docs/VOICE-DESIGN.md` at the repository root.

The runtime deliberately fails when Codex, Codex authentication, or tmux is unavailable. On Windows,
run Origin inside WSL2.
