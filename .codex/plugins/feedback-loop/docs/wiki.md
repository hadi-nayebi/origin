---
title: Feedback Loop
version: 1.0.0-alpha.2
status: experimental
objective: Turn page-aware feedback into one durable ordered work loop and derive whether the local agent may stop.
---

# Feedback Loop

## Capability

This plugin validates and stores feedback created from any Origin route,
selects one focused actionable record, controls its lifecycle, and derives the
Codex Stop outcome from the current ledger. It is the only shipped cognition in
Origin 1.0.

It does not implement the requested dashboard change, treat feedback as
authority, run commands from its body, synchronize users, manage general jobs,
or wake an idle terminal process. Stop enforcement works when Codex attempts to
finish; asynchronous local wake delivery remains future work.

## State and lifecycle

The plugin owns `.origin/feedback.jsonl`, an ignored, clone-local append-only
event ledger. Created records begin `open`. Legal transitions are:

- `open` to `in_progress`, `waiting`, or `dismissed`;
- `in_progress` to `waiting`, `resolved`, or `dismissed`;
- `waiting` to `in_progress` or `dismissed`; and
- `resolved` or `dismissed` to reopened `open`.

Continue an in-progress record first; otherwise select the oldest open record.
Any such record blocks Stop. When only waiting records remain, Stop is allowed
with visible waiting context. With no actionable or waiting records, Stop
passes silently.

Every mutation acquires one clone-local lease, rereads and validates the exact
current ledger, validates the proposed transition, and atomically publishes a
complete successor. Readers see either the predecessor or successor file.

## Interfaces

The browser server and CLI compose through `lib/service.mjs`. The public CLI
supports `list`, `next`, `outcome`, `start`, `wait`, `resolve`, `dismiss`, and
`reopen`. Raw persistence in `lib/store.mjs` is internal.

The Stop hook handles only an exact `Stop` event. Active work writes bounded
guidance to stderr and exits `2`; waiting work emits the Codex continuation
envelope while permitting the turn to end; idle is silent. Human-facing hook
text comes from `voice.xml`.

## Failure behavior and maturity

Malformed JSON, unsupported events, illegal replayed transitions, unknown
fields, invalid timestamps, and unsafe values fail closed. A corrupt ledger is
preserved for diagnosis. The Stop hook blocks when state or voice rendering
cannot be trusted.

The manifest and isolated implementation are validated and tested. Real Codex
host registration and trust, asynchronous wake delivery, browser visual proof,
and native Windows/macOS execution are not yet proven. This plugin is therefore
experimental, not stable.

