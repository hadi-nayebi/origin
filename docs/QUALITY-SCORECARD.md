# Origin 1.0 evidence scorecard

Each dimension has ten binary criteria. A criterion receives one point only when its named evidence
has been executed or inspected on the current revision. No partial credit or extrapolation is used.

## Architecture and plugin anatomy

1. Academy/Base Dashboard role is explicit.
2. Web-to-CLI handoff continuation is explicit.
3. One persistent interactive Codex session is the default.
4. tmux transport is required rather than silently bypassed.
5. `contextual-feedback` has objective, boundary, manifest, schema, service, voice, docs, and tests.
6. `agent-stop-state` has objective, state schema, service, voice, hook, docs, and tests.
7. Runtime transport is marked infrastructure and owns no cognitive policy.
8. Server and UI use public service boundaries rather than raw files.
9. Clone-local runtime state remains under ignored `.origin/`.
10. Included and future capabilities are distinguished in the Wiki.

## Interactive delivery

1. Combined launch checks Git, Node, tmux, Codex, and authentication.
2. Combined launch starts or reuses the live dashboard.
3. Combined launch opens the browser.
4. A repository-scoped tmux session is created or reused.
5. An idle shell receives Codex; an existing Codex process is reused.
6. A different process is never overwritten.
7. Exactly one repository-owned Codex pane is required for injection.
8. Idle prompts are submitted and busy prompts queue without interruption.
9. Paste and submission are verified.
10. Wake claims, missing mutation-to-wake records, retries, and interrupted delivery recover
    durably.

## Feedback, authority, and stopping

1. Raw feedback and page context are preserved.
2. Agent interpretation is separate from raw input.
3. Thread questions and user answers are durable.
4. Linked work and progress remain inspectable.
5. Only one thread is in progress.
6. Other runnable work prevents a single blocked thread from making the agent globally waiting.
7. Agent verification is required before review.
8. User acceptance is required for resolution.
9. Rejection and reopening preserve history and wake Codex.
10. Active blocks Stop; waiting, paused, idle, and corrupt-state behavior are tested.

## Interface and security

1. The shipped canvas contains no domain page or workflow.
2. Wiki and Feedback remain available across routes.
3. Feedback captures kind, body, page path, and page label.
4. Threads show raw messages, interpretation, verification, and lifecycle.
5. Waiting questions and review requests display an attention indicator.
6. User answer, acceptance, dismissal, and reopening operate through bounded APIs.
7. Server binds only to loopback and rejects cross-origin requests.
8. Payload, path, and content-type boundaries are enforced.
9. Wake prompts contain identifiers/routes rather than raw bodies.
10. Modal keyboard behavior and serious/critical accessibility checks pass.

## Verification and release

1. Lint passes.
2. Formatting passes.
3. Type checking passes.
4. Production build passes.
5. Node unit/integration tests pass.
6. UI/API/accessibility tests pass.
7. Coverage thresholds pass.
8. Production smoke test passes.
9. Production dependency audit passes at high severity.
10. Required GitHub Actions matrix jobs pass.

## Live authenticated operation

1. The target machine passes `npm run doctor`.
2. The combined command starts dashboard and interactive Codex.
3. The user inspects and trusts the Stop hook.
4. `npm run acceptance:codex` reaches the correct pane.
5. Idle feedback wakes the same session.
6. Feedback during active work queues without interruption.
7. Agent question appears in the dashboard and permits legitimate waiting.
8. User answer wakes the same session and work resumes.
9. Verification, user acceptance, rejection, and reopening complete successfully.
10. Restart recovers pending feedback and wake delivery.

The live dimension remains incomplete until performed on an authenticated target machine. CI is not
a substitute for that evidence.
