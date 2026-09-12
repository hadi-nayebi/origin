# Dashboard state compatibility

Existing `npm run agent-state -- get|pause|resume|stop-outcome` commands continue to operate on
dashboard engagement. State now lives at `.origin/contextual-feedback/data.json`. The old
`.origin/agent-stop-state/data.json` is imported once when needed, preserving pause. Telegram owns
`.origin/telegram-engagement/data.json` and its own commands and Stop hook. Removing either
engagement plugin does not remove the neutral state implementation.

Use `npm run telegram -- pause|resume|status` for the remote channel. A pause affects only the
selected channel. The old hook file is retained for compatibility tests and is no longer registered.
See `docs/TWO-CHANNEL-REVIEW.md` for the migration and acceptance evidence.
