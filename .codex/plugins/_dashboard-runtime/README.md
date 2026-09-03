# Dashboard Runtime

Origin's runtime starts the local dashboard and one persistent interactive Codex session. tmux is
the session and injection transport; it is not the source of truth. Dashboard mutations are saved
before a wake is attempted, and the durable outbox survives terminal or server interruption. On
startup, actionable feedback revisions without a corresponding wake record are reconstructed before
delivery resumes, closing the persistence-to-notification crash window.

The runtime deliberately fails when Codex, Codex authentication, or tmux is unavailable. On Windows,
run Origin inside WSL2.
