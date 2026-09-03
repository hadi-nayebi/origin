# Agent Stop State

Origin separates a responsibility's lifecycle from the agent's global ability to stop. A feedback
thread knows whether it is open, being implemented, blocked, awaiting review, accepted, or reopened.
`agent-stop-state` knows only whether Origin as a whole is idle, active, waiting, or paused.

This compartment prevents one waiting thread from hiding another runnable request and lets future
plugins participate in the same Stop contract without rewriting feedback policy.

The Stop voice reorients rather than merely refuses. Active identifies the owning responsibility and
the evidence needed to leave it. Waiting explains why further generation would be futile. Paused
preserves human interruption while its resume snapshot continues receiving validated reconciliation.
Idle is derived from the complete queue. The hook exit code enforces; the voice teaches the reason
and the next valid boundary.
