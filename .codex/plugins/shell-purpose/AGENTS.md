# Shell purpose plugin

Objective: make the agent connect each pending Bash operation to its intended outcome before
execution. The supported adapter is a leading `# Purpose: ` command comment containing 20–240
Unicode code points after trimming, followed by a nonempty command. Do not invent an extra native
tool field. Lifecycle voices restore this rule at startup, resume, clear, compact, user turns and
subagent start. The synchronous Bash hook enforces shape, not truth, authorization or semantic
adequacy. Valid calls abstain; they never override owner authority. No command execution, persistent
external calls. Every Bash validation transaction appends bounded ignored state under
`.origin/shell-purpose/data.json`: exact purpose text, a command digest, command-family shape,
decision and candidate counts. Never store the raw command. `policy.json` is the only promotion
surface; observations may suggest executable or shape candidates but may not promote themselves or
change permission. Missing state initializes version 1; corrupt, legacy or unwritable state fails
closed without overwriting the evidence. Keep policy, schema, voices, registration and tests
aligned. Removing this plugin's registrations and ignored state must leave other hooks unchanged.
Live host trust and behavior require separate acceptance evidence.
