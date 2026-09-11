# Dashboard state compatibility adapter

This directory preserves existing `npm run agent-state` commands for dashboard engagement. It
re-exports the neutral core and targets `.origin/contextual-feedback/data.json` by default. It is
not a global owner. The registered Stop hooks now belong to each engagement channel. Do not route
Telegram state through this adapter. Legacy `.origin/agent-stop-state/data.json` is imported once
into dashboard state if the new dashboard state does not exist; preserve its explicit pause and
leave the old file untouched for recovery.
