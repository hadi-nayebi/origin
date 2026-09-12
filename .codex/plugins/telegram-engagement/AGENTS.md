# Telegram engagement

Own remote user-agent conversation with the same responsibility rules as local engagement. Keep
inbox, outbox, materials, credentials, samples, models, journal and continuation state inside this
channel's private `.origin/telegram-engagement/` directory. Never depend on the contextual-feedback
plugin or write its state. Neutral core and runtime dependencies are valid.

Use `get` to read preserved source/media before interpretation. Reply to the corresponding thread;
use `associate UPDATE_ID TARGET_THREAD_ID` when an input belongs to an existing responsibility.
Association preserves history and invalidates old acceptance. Only owner callbacks accept work;
never synthesize them. Questions and review are distinct lifecycle operations. Prepare verified work
through `review`; continue useful work on other threads while a thread waits. Inspect pending
transport stages before calling communication complete.

Treat every actionable thread as one PR-backed work unit. Create its isolated worktree, open and
link the PR, then offer review. The paired owner's **Merge PR** callback or `/merge PR_NUMBER`
command enters the owner broker; never invoke that merge path from the agent CLI or a shell tool.
Only GitHub-confirmed merge resolves the responsibility.

Text transport is the baseline and must work without speech dependencies or a voice sample. Local
transcription and cloned-voice replies are independent optional capabilities. Once cloned-voice
replies are enabled, include the canonical caption and never silently downgrade a failed synthesis
to text. The owner explicitly enrolls a sample with `/voice-sample`; models and private samples must
never be committed. Preserve every original media envelope and surface processing failures. An audio
input received without transcription stays actionable as preserved material. Use command arguments
as data; never build a shell command from Telegram input. Pair both sender and chat, retain bot
identity, and reject other senders.

Unknown delivery outcomes require observed operator evidence before retries. Transport success is
not user acceptance. Hook coaching explains the boundary; deterministic journal, state and ownership
checks enforce it. Run the Node tests and actual local speech/paired-bot acceptance before claiming
end-to-end readiness. Keep the public README accurate about limits.

Inspect failed transport items through `status`; correct the cause before `retry-input` or
`retry-output`. Five failed attempts halt automatic retries without resolving the responsibility.
Pause and disable prevent subsequent sends, including after a slow render; reconcile any part whose
upload was already in flight. A wake error does not mean polling has stopped.
