# Agent Stop State compatibility

Origin now gives each engagement channel its own continuation state and Stop decision. Dashboard
feedback lives at `.origin/contextual-feedback/data.json`; Telegram lives at
`.origin/telegram-engagement/data.json`. The registered hooks compose those decisions: any active
channel blocks Stop, while a passive channel abstains.

This `agent-stop-state` package is a compatibility adapter for the older dashboard commands and
state file. A legacy `.origin/agent-stop-state/data.json` is imported once into dashboard state. It
does not own a global queue and is no longer a registered hook.

The Stop voice reorients rather than merely refuses. Active identifies the owning responsibility and
the evidence needed to leave it. Waiting explains why further generation would be futile. Paused
preserves human interruption while its resume snapshot continues receiving validated reconciliation.
Idle is derived from the owning channel's complete queue. Each channel hook enforces its own vote;
its voice teaches the reason and the next valid boundary.
