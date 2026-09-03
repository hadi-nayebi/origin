# Local server boundary

The server validates HTTP shapes, calls the public `contextual-feedback` library, persists wake
events before scheduling tmux delivery, renders tracked wiki sources, and serves the dashboard.
Feedback lifecycle belongs to Contextual Feedback; Stop decisions belong to Agent Stop State; tmux
delivery belongs to the runtime.

Bind to loopback by default. Do not introduce authentication, remote access, cloud storage, Git
synchronization, or multi-user policy into Origin 1.0.
