# Local server boundary

The server validates HTTP shapes, calls the public `contextual-feedback` library, persists wake
events before scheduling tmux delivery, renders tracked wiki sources, and serves the dashboard.
Feedback lifecycle belongs to Contextual Feedback; Stop decisions belong to Agent Stop State; tmux
delivery belongs to the runtime.

Bind to loopback by default. Do not introduce authentication, remote access, cloud storage, Git
synchronization, or multi-user policy into Origin 1.0.

HTTP success means the authoritative mutation and durable wake record were saved; it does not mean
tmux delivery already completed. Return delivery state precisely so the interface never calls a
scheduled or retrying wake “notified.” Dashboard review routes are user-facing capability surfaces;
keep them separate from the agent CLI and record review plus lifecycle transition atomically. This
separation reduces accidental authority confusion but is not a security boundary against a malicious
process running as the same operating-system user.
