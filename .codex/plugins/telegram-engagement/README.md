# Telegram engagement (preview)

An optional remote communication channel for Origin. Its journal, continuation state, inbox and
outbox live under `.origin/telegram-engagement/`, independently of dashboard feedback. Both channels
use the neutral `_engagement-core` library. Deleting either channel's plugin leaves the other
available. Keep the neutral core and runtime when removing a channel.

This branch is under implementation and review. See `docs/TWO-CHANNEL-REVIEW.md` for tested evidence
and remaining acceptance work. Do not enable it on a bot already owned by another application.

## Activation

1. Install Origin's Node/tmux/Codex prerequisites, Python 3.11+ with venv, and FFmpeg. Run `npm ci`
   in your own clone.
2. Create a dedicated bot with Telegram's @BotFather. Its **token** is secret; the numeric bot ID
   alone is not a credential. No Telegram account session string is required: this plugin uses the
   Bot API, not a user-account client.
3. Run `npm run telegram -- setup` in a terminal. Paste the token into the hidden prompt. Send the
   displayed one-time `/pair` challenge to your bot in a private chat. Setup records the bot ID,
   chat ID and sender ID. Other senders are ignored.
4. Run `npm run telegram -- install-voice`. This creates a private Python venv and downloads
   Qwen3-TTS 0.6B Base and Faster Whisper base under `.origin/`. Downloads require internet, disk
   space and local compute. Inference uses local models; there are no paid speech API calls. CPU
   generation can be slow. Models, tokens, conversations and voice samples are never repository
   assets.
5. Run `npm run telegram -- run`. In the paired chat send `/voice-sample`, then a clear voice note
   of your own voice. Only the next voice/audio input within ten minutes is used for enrollment. The
   first 30 seconds are normalized and transcribed locally. Review the sample transcript and
   cloned-voice preview before relying on it. Use only your voice or an explicitly authorized
   sample.
6. Run `npm run telegram -- doctor` and follow the acceptance sequence in the review document.
   Review and trust the exact repository Stop hooks in Codex. Start `npm run origin`; for a terminal
   without the dashboard use `npm run origin -- --telegram-only`.

## Interaction

New messages create responsibilities; reply to a bot message or your earlier message to continue
that thread. Edits are preserved as new contributions. Voice and audio are transcribed; captions and
original files are retained. Photos, documents, videos, animations, stickers and video notes are
downloaded with metadata. Unrecognized message forms retain their raw update for inspection.
Telegram's Bot API limits apply (default cloud download cap: 20 MiB); a large or unprocessable
attachment remains visible for recovery, never silently discarded.

The agent uses `npm run telegram -- list`, `next`, `get ID`, `start ID`, `reply ID "text"`,
`ask ID "question"`, `review ID "verification evidence"`, and
`material ID /path/to/file "description"`. Replies are generated locally in voice with the exact
readable caption, and longer replies are split. Review buttons belong to one version of a thread; a
later contribution invalidates an older acceptance button. Agents cannot accept their own work.

`/pause` pauses only Telegram; `/resume` resumes it. Dashboard state is unaffected. `disable`
preserves history and removes Telegram's continuation vote. A paused channel can still receive
durable inputs for later work. Neither passive hook emits `continue:false`: one channel cannot
override the other's active vote.

## Customization and recovery

Private `config.json` selects language, CPU/CUDA device and model identifiers. The Python worker and
Node voice adapter are replaceable local speech boundaries; the Bot API, media normalization,
durable transport, lifecycle and wake adapter are separate modules. Keep authentication, idempotency
and acceptance tests when extending them. Never place user text into a shell command.

`status` shows input/output delivery stages; `get ID` includes source metadata and local materials.
`retry-input UPDATE_ID` retries a preserved failed input. Unknown send outcomes must be reconciled
by an operator before another send; blind retries can duplicate a Telegram message. Hook
registration cannot wake a stopped process by itself: the listener and the exact local Codex/tmux
session must remain running. A sleeping or powered-off laptop cannot process messages.
