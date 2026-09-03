# Live Codex acceptance contract

Repository tests prove deterministic state, tmux command construction, pane scoping, queueing,
delivery claims, retry, API, UI, hooks, and recovery. They cannot prove a particular user's Codex
authentication, terminal behavior, hook trust, browser opening, or operating-system integration.

## Machine and transport check

With Origin running through `npm run origin`, open a second terminal in the same repository and run:

```bash
npm run doctor
npm run acceptance:codex
```

The acceptance command requires the complete authenticated kit, resolves exactly one interactive
Codex pane for the repository, delivers a bounded non-mutating message through tmux, and reports
whether Codex accepted it immediately or queued it behind active work.

## Complete lifecycle check

1. Run `npm run origin`; confirm the browser opens and the terminal attaches to interactive Codex.
2. In Codex, use `/hooks`, inspect `.codex/hooks.json`, and trust the Agent Stop State hook.
3. Leave one dashboard comment while Codex is idle. Confirm it appears in that same terminal
   session.
4. Start the feedback and perform a deliberately bounded change.
5. While Codex is working, leave a second unrelated comment. Confirm it queues without interrupting
   the current tool call and remains visible as separate responsibility.
6. From Codex, run `npm run feedback -- ask <id> "..."`. Confirm the question appears in the thread
   with the red attention indicator.
7. If another runnable thread exists, confirm global state remains active. After runnable work is
   exhausted, confirm it may become waiting.
8. Answer in the dashboard. Confirm the answer enters the same Codex session and state becomes
   active.
9. Have Codex mark the work ready for review with verification evidence. Confirm Codex may wait but
   the thread is not resolved.
10. Reject/reopen once, confirm Codex wakes and prior history remains, then accept the corrected
    work.
11. Confirm the next runnable thread becomes active; after all accepted work closes, confirm state
    is idle and Stop is allowed.
12. Create another comment, stop the dashboard before delivery, restart `npm run origin`, and
    confirm the saved thread and wake outbox recover.

Record operating system, WSL/macOS/Linux details, Node/tmux/Codex versions, commit SHA, timestamps,
feedback IDs, outbox results, and any deviation. Origin is not live-accepted until this sequence has
actually passed on the target machine.
