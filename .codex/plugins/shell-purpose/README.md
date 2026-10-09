# Shell purpose

A small friction example: make the agent state what a Bash call should accomplish before it runs.
This plugin is independent of the communication plugins and owns no durable runtime state.

## Command contract

Every native Bash command must begin with this exact heading and a purpose of 20–240 Unicode code
points after trimming, then contain a command on subsequent lines:

```bash
# Purpose: Inspect the working tree before choosing the files for this change.
git status --short
```

This is an additional required piece of the **existing command field**, not a new native JSON
argument. Codex's documented Bash hook supplies `tool_input.command`; adding arbitrary tool-schema
fields is not this plugin's capability. A future host adapter can expose a genuine purpose argument.
The parser accepts a command string or a recognized Bash/sh/zsh argv form with a `-c` option.
Unsupported forms, absent headings, out-of-range purposes and empty commands are denied.

## Instruction and enforcement

Host registration in `.codex/hooks.json` calls `hook.mjs`. SessionStart covers startup, resume,
clear and compact. The documented compact SessionStart runs before the next model request, including
mid-turn automatic compaction. UserPromptSubmit and SubagentStart also inject the plugin-owned
voice. PostCompact does not document additional-context injection; we do not pretend it does.
PreToolUse matches Bash, synchronously denies invalid shapes and explains how to correct the call.
Valid calls emit nothing, so other hooks retain their authority. Hooks never execute the command.

## Install, remove and failure boundary

Origin ships these registrations as an example. In a personal clone, inspect and trust the hooks
through the host's ordinary `/hooks` interface; this PR does not install or trust them for you.
Remove entries whose command references `/shell-purpose/hook.mjs` from `.codex/hooks.json`, then
remove this directory if desired. Preserve the owner-authority PreToolUse and communication Stop
entries. No database or channel state needs migration. Missing Node, untrusted hooks or host
failures are host acceptance conditions, not certified enforcement by our tests. Malformed hook JSON
yields a denial response; valid unrelated events abstain.

## Limits and evidence

The shape creates a prompt to articulate intent. It cannot certify that the explanation is true,
that the operation is authorized, or that all other execution paths are covered. Interactive stdin,
commands issued outside native Bash and other tools are outside this example's sensing boundary. It
is workflow friction, not a security sandbox. Assess whether an actual model responds usefully to
the correction separately from parser correctness. No model training or selection is implemented.

Run `node --test .codex/plugins/shell-purpose/tests/*.test.mjs`. Tests exercise native hook
subprocess input/output, lifecycle voices, boundaries, argv and independence from existing authority
hooks. Authenticated startup/resume/compact/model correction is not established by these
deterministic tests.

Contract reference: https://learn.chatgpt.com/docs/hooks (reviewed October 9, 2026).
