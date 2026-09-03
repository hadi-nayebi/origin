# Agent Stop State

`agent-stop-state` is Origin's low-level continuation control. It owns exactly one state record for
the local clone and exposes the decision read by the Codex Stop hook.

## State

Runtime state lives at `.origin/agent-stop-state/data.json` and is intentionally untracked.

- `idle`: no runnable Origin responsibility remains.
- `active`: useful progress is possible and Stop is blocked.
- `waiting`: all remaining progress is blocked on a recorded user, permission, or external input.
- `paused`: the user explicitly paused Origin; this is not completion.

The feedback plugin reconciles this state after every authoritative feedback mutation. The state
plugin does not inspect or own feedback records.

While paused, validated reconciliation requests update the preserved resume state without overriding
the user's pause. Resuming therefore reflects feedback that arrived, closed, or changed during the
pause instead of restoring a stale snapshot.

## Voice objective

The Stop hook is a hard boundary only in `active`. Its voice explains the unresolved evidence and
the valid lifecycle operation that changes the boundary. Waiting and paused voices explain why
stopping does not mean completion. Idle explains that the complete owning-plugin queue—not the
agent's desire to finish—derived the absence of runnable work.

## Interfaces

```bash
npm run agent-state -- get
npm run agent-state -- stop-outcome
npm run agent-state -- pause "User requested a pause"
npm run agent-state -- resume
```

Private mutation commands are reserved for validated plugin integrations. See `scripts/state.mjs`.

## Failure behavior

Missing or corrupt state fails closed in the Stop hook. The combined Origin launcher initializes
state before opening Codex, and the feedback service reconciles it from durable feedback state.
