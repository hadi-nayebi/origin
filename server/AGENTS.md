# Local server boundary

The server validates HTTP shapes, calls the neutral core on behalf of `contextual-feedback`,
persists wake events before scheduling tmux delivery, renders tracked Wiki and reference-plugin
sources inside Admin, and serves the dashboard. Feedback lifecycle belongs to Contextual Feedback;
each channel owns its Stop decision; tmux delivery belongs to the runtime.

Bind to loopback by default. The optional Telegram plugin supplies authenticated remote engagement
separately. Do not expose the dashboard HTTP server to the network or introduce cloud storage, Git
synchronization or multi-user policy.

HTTP success means the authoritative mutation and durable wake record were saved; it does not mean
tmux delivery already completed. Return delivery state precisely so the interface never calls a
scheduled or retrying wake “notified.” Dashboard review routes are user-facing capability surfaces;
keep them separate from the agent CLI and record review plus lifecycle transition atomically. This
separation reduces accidental authority confusion but is not a security boundary against a malicious
process running as the same operating-system user.
