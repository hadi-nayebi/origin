# Telegram engagement (preview)

An optional remote communication channel for Origin. Its journal, continuation state, inbox and
outbox live under `.origin/telegram-engagement/`, independently of dashboard feedback. Both channels
use the neutral `_engagement-core` library. Deleting either channel's plugin leaves the other
available. Keep the neutral core and runtime when removing a channel.

The plugin is merged as an optional preview with extensive automated and bounded private-test
evidence. Dedicated-bot, fresh-machine, and owner listening acceptance remain before a general
availability claim. See `docs/TWO-CHANNEL-REVIEW.md`. Do not enable it on a bot already owned by
another application.

Text is the baseline transport. Local transcription and cloned-voice output are optional and can be
added later without repairing or re-pairing the bot.

## Text activation

1. Install Origin's Node/tmux/Codex prerequisites and run `npm ci` in your own clone. Python, FFmpeg
   and speech models are not required for text operation.
2. Create a dedicated bot with Telegram's @BotFather. Its **token** is secret; the numeric bot ID
   alone is not a credential. No Telegram account session string is required: this plugin uses the
   Bot API, not a user-account client.
3. Run `npm run telegram -- setup` in a terminal. Paste the token into the hidden prompt. Send the
   displayed one-time `/pair` challenge to your bot in a private chat. Setup records the bot ID,
   chat ID and sender ID. Other senders are ignored.
4. Run `npm run telegram -- run`, then send a text message to the paired bot. Text replies, thread
   controls and returned files work without a voice sample.
5. Run `npm run telegram -- doctor` and follow the text acceptance sequence in the review document.
   Review and trust the exact repository Stop hooks in Codex. Start `npm run origin`; for a terminal
   without the dashboard use `npm run origin -- --telegram-only`.

## Optional local speech

Run `npm run telegram -- install-voice` to create a private Python venv and download Qwen3-TTS 0.6B
Base and Faster Whisper base under `.origin/`. Install FFmpeg, restart the listener, then send
`/voice-sample` followed by a clear voice note of your own voice. Only the next voice/audio input
within ten minutes is used for enrollment. The first 30 seconds are normalized and transcribed
locally. Successful enrollment enables cloned-voice replies; use
`npm run telegram -- voice-replies off` to return to text or `voice-replies on` after the sample is
ready. Restart the listener after changing voice-reply mode. Review the transcript and preview
before relying on the voice. Use only your voice or an explicitly authorized sample.

Downloads require internet, disk space and local compute. Inference uses local models; there are no
paid speech API calls. CPU generation can be slow. Models, tokens, conversations and voice samples
are never repository assets.

## Interaction

New messages create responsibilities; reply to a bot message or your earlier message to continue
that thread. Edits are preserved as new contributions. Voice and audio are transcribed when optional
speech is enabled; otherwise the source stays preserved as actionable material without blocking
later text. Captions and original files are retained. Photos, documents, videos, animations,
stickers and video notes are downloaded with metadata. Unrecognized message forms retain their raw
update for inspection. Telegram's Bot API limits apply (default cloud download cap: 20 MiB); a large
or unprocessable attachment remains visible for recovery, never silently discarded.

The agent uses `npm run telegram -- list`, `next`, `get ID`, `start ID`, `reply ID "text"`,
`ask ID "question"`, `review ID "verification evidence"`, and
`material ID /path/to/file "description"`. Replies are readable text by default and longer replies
are split without losing content. When cloned-voice replies are enabled, each voice message carries
the exact readable caption.

Each actionable parent thread is one PR-backed work unit. The agent runs `worktree ID`, implements
and verifies on the returned isolated branch, opens a GitHub PR, and runs
`link-pr ID https://github.com/OWNER/REPO/pull/NUMBER` before `review`. The PR head must be that
exact managed branch. The owner can then use the thread's **Merge PR** button or send
`/merge NUMBER` in the paired private chat. Review buttons belong to one displayed version; later
input invalidates an older button. The owner broker confirms the remote GitHub merge before
recording resolution. Agents have no merge command, and the trusted owner-authority hook blocks
supported agent merge paths and protected-base pushes.

`/pause` pauses only Telegram; `/resume` resumes it. Dashboard state is unaffected. `disable`
preserves history and removes Telegram's continuation vote. A paused channel can still receive
durable inputs for later work. Neither passive hook emits `continue:false`: one channel cannot
override the other's active vote.

## Customization and recovery

Private `config.json` records whether transcription and cloned-voice replies are enabled and selects
language, CPU/CUDA device and model identifiers. The Python worker and Node voice adapter are
replaceable local speech boundaries; the Bot API, media normalization, durable transport, lifecycle
and wake adapter are separate modules. Keep authentication, idempotency and acceptance tests when
extending them. Never place user text into a shell command.

`status` shows input/output delivery stages; `get ID` includes source metadata and local materials.
`retry-input UPDATE_ID` retries a preserved failed input. Unknown send outcomes must be reconciled
by an operator before another send; blind retries can duplicate a Telegram message. Hook
registration cannot wake a stopped process by itself: the listener and the exact local Codex/tmux
session must remain running. A sleeping or powered-off laptop cannot process messages.

## Operator recovery commands

- `npm run telegram -- reconcile-output PACKAGE_ID text|voice|material INDEX sent|not-sent MESSAGE_ID "observed evidence"`
  records an inspected indeterminate part. Index is zero-based; use `0` for the message ID only when
  confirming it was not sent. Inspect the paired chat first.
- `npm run wake -- reconcile contextual-feedback|telegram-engagement WAKE_ID submitted|not-submitted "observed evidence"`
  reconciles a wake after inspecting the exact Codex pane. Confirm that pending editor text is
  cleared or submitted before choosing not-submitted.
- `npm run telegram -- sample-text /absolute/path/to/transcript.txt` corrects the reference sample
  transcript. Restart the listener to clear its cached clone prompt and queue a reply to preview it
  again.
- `npm run telegram -- associate UPDATE_ID PARENT_THREAD_ID` moves the source conversation's
  responsibility to the parent and preserves every contribution.

A model installation writes `model-receipts.json` with exact upstream revisions. To reproduce them,
set `qwenRevision` and `sttRevision` in private config before installing. Optional `pronunciation`
maps written phrases to spoken forms for local synthesis; captions keep the original text. Speech
quality is checked with local recognition, but you should listen to your enrollment
preview—automatic alignment cannot certify speaker similarity, pronunciation or multilingual
quality.

Text and voice input create the same responsibility. Text transport does not load a speech worker.
If optional transcription is disabled, audio remains preserved and visible for inspection. Once
cloned-voice replies are enabled, missing models or a failed render remain a visible pending item;
there is no silent paid or text fallback from an explicitly enabled voice mode.

Speech chunks default to 300 characters; `speechChunkChars` can be set from 48 to 900. A CUDA device
with insufficient free memory records `GPU_BUSY` and retries after a delay, without interrupting
other applications. CPU remains the portable default. GPU memory requirements vary with model,
sample and reply length.

## Delivery and processing boundaries

Replies and returned files visibly reply to the relevant Telegram input. Incoming album items share
one thread. Exact raw updates are preserved, including unfamiliar media forms; unsafe display
characters are normalized only in the conversation projection. Captions such as `/pause` on an
attachment are treated as content, so the attachment is not discarded as a command.

Pausing or disabling during synthesis prevents later sends; an upload already in flight can have an
unknown outcome and still requires reconciliation. Recoverable processing errors retry up to five
attempts, then remain visible as `failed` responsibilities. Repair the cause and use
`retry-input UPDATE_ID` or `retry-output PACKAGE_ID`. Unknown network outcomes are never retried by
these commands. Terminal wake errors are recorded in `wake-error.json` without ending polling. Voice
enrollment creates a thread immediately, so a processing failure is still inspectable, and the
preview includes the selected sample transcript for owner review.

Local ASR verification requires at least 0.85 normalized alignment and a matching final word pair,
including character-aware handling for Han text. A rejected render stays pending for repair or
retry; automatic verification still cannot certify speaker similarity or every pronunciation.
