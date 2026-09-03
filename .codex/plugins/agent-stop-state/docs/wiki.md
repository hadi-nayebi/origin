# Agent Stop State

Origin separates a responsibility's lifecycle from the agent's global ability to stop. A feedback
thread knows whether it is open, being implemented, blocked, awaiting review, accepted, or reopened.
`agent-stop-state` knows only whether Origin as a whole is idle, active, waiting, or paused.

This compartment prevents one waiting thread from hiding another runnable request and lets future
plugins participate in the same Stop contract without rewriting feedback policy.
