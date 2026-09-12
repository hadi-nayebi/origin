# Contextual Feedback plugin

Objective: turn page-aware dashboard feedback into durable user-agent conversation and reviewed
responsibility.

The plugin owns validation, persistence, thread messages, lifecycle, focus ordering, interpretation
records, linked work, questions, answers, verification, acceptance, and recovery. It does not
implement requested changes, execute shell commands from feedback, own another channel's state,
deliver tmux prompts, define user identity, synchronize clones, or manage general jobs.

Keep raw feedback out of wake injections. Those surfaces carry a validated stable record ID and
route; the agent retrieves the thread through the public CLI. After every authoritative mutation,
reconcile the complete feedback queue into `.origin/contextual-feedback/data.json` through the
neutral core. This plugin owns its own Stop decision. Any lifecycle change requires corresponding
schema, voice, interface, test, and documentation changes.

Contextual Feedback voices protect four cognitive behaviors: preserve the user's raw observation,
separate interpretation from authority, preserve one focus without losing later input, and require
verification plus user review before closure. Every event voice explains which of these behaviors is
at stake, directs Codex to the validated thread, and names the next lifecycle boundary. New
feedback, feedback during active work, answers, reopening, acceptance, withdrawal, and session
resumption are different orientations and must not share vague generic wording.

Question, answer, and dashboard review actions must be single journal events so the conversation and
its lifecycle cannot disagree after interruption. The agent-facing CLI may prepare work for review;
user-owned acceptance, reopening, dismissal, pause, and resume remain distinct interface actions.

Thread material references are stable journal message IDs. Read file metadata/paths through `get`,
inspect the original bytes before interpretation, and use `material` to return files. Browser review
requires the displayed version; associated sources are reviewed only through the full parent.
