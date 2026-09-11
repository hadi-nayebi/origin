# Dashboard Runtime

Origin's runtime starts the local dashboard and one persistent interactive Codex session. tmux is
the session and injection transport; it is not the source of truth. Dashboard mutations are saved
before a wake is attempted, and the durable outbox survives terminal or server interruption. On
startup, actionable feedback revisions without a corresponding wake record are reconstructed before
delivery resumes, closing the persistence-to-notification crash window.

Delivery validates the referenced feedback and owning channel state before each attempt. If either
source cannot be trusted, the wake remains retrying in the outbox until recovery succeeds. Only a
validated lifecycle state that no longer requires the wake may cancel it.

Every wake carries the owning feedback journal event's sequence and hash plus a unique delivery
marker. Pending, retrying, and claimed events are retained without a count limit; only completed or
cancelled delivery history is bounded. A manual retry cancels scheduled backoff and attempts
delivery immediately. Starting a new interactive session creates a resume orientation when runnable
feedback exists but no wake is pending.

The runtime does not write cognitive instructions. It renders the voice owned by Contextual
Feedback, adds transport evidence, and records whether the specific prompt was pasted and submitted.
An existing queued-message banner is not submission evidence for a new wake. If the new paste
remains pending, the outcome becomes indeterminate. Origin never blindly repeats Enter or re-pastes
it. Inspect the exact pane and record evidence with
`npm run wake -- reconcile CHANNEL WAKE_ID submitted|not-submitted "observed evidence"` before
recovery. See `docs/VOICE-DESIGN.md` at the repository root.

The runtime deliberately fails when Codex, Codex authentication, or tmux is unavailable. On Windows,
run Origin inside WSL2.
