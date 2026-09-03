# Live Codex acceptance contract

Automated tests prove Origin's state machine, process boundary, retry supervision, HTTP path, and
Stop-hook protocol with deterministic local processes. They cannot prove a user's Codex
authentication or silently trust a project hook. Those are host-owned security boundaries.

## Isolated real-CLI check

Run these commands with Codex installed and authenticated:

```bash
npm run doctor -- --require-agent
npm run acceptance:codex
```

The acceptance command copies only tracked files into a temporary Git repository, creates one
non-mutating feedback request, launches the configured CLI through Origin's production delivery
adapter, and requires the agent to retrieve and resolve that record with evidence. It also requires
an idle final Stop outcome and a clean fixture worktree. The fixture is deleted only after success
and retained for diagnosis after failure.

This command consumes real agent usage. It is intentionally excluded from CI because CI has no user
authentication and must not replace a real-agent check with a fake claim.

## Trusted-hook and dashboard check

1. Start `npm run origin` and leave the dashboard server running.
2. In an interactive Codex session for this repository, open `/hooks`, inspect the exact Stop hook,
   and trust it.
3. Submit two dashboard feedback records. While the first is active, submit a third.
4. Confirm the Feedback panel reports the headless worker's current record and that
   `.origin/agent.log` receives output.
5. Confirm the focused record completes first, the remaining open records complete in creation
   order, and every resolution includes verification evidence.
6. Confirm the Stop hook blocks an attempted stop while an actionable record remains.
7. Put one record into `waiting` with a genuine external dependency and confirm stopping is allowed
   without resolving it.
8. Reopen that record, complete it, and confirm the queue and Stop outcome return to idle.
9. Stop the server with an open record, restart it, and confirm startup resumes delivery.

Origin is not live-host accepted until both sections pass on the target machine. Repository tests
and structural review must never be reported as substitutes for this evidence.
