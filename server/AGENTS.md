# Local server boundary

The server is policy-neutral infrastructure. It validates HTTP shapes, calls
the public `feedback-loop` library, renders tracked wiki sources, and serves
the dashboard. Feedback lifecycle and Stop decisions belong to the plugin.

Bind to loopback by default. Do not introduce authentication, remote access,
cloud storage, Git synchronization, or multi-user policy into Origin 1.0.

