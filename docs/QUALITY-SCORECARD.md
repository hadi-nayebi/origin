# Origin 1.0 evidence scorecard

This scorecard prevents impression-based quality scores. Each dimension contains exactly ten binary
criteria. One passed criterion equals one point; partial credit is forbidden. A criterion passes
only when its named evidence was executed or inspected in the current revision. An unavailable or
unexecuted check scores zero.

## Plugin anatomy

1. One explicit cognitive objective.
2. Canonically valid `.codex-plugin/plugin.json`.
3. Plugin-local `AGENTS.md` boundary.
4. Validated public data schema and contracts.
5. Separate lifecycle and ordering policy.
6. Separate persistence and integrity compartments.
7. One public service gateway for state operations.
8. Separate shell-free delivery adapter.
9. Every stable agent injection is rendered from `voice.xml`, with a registered Stop hook.
10. Operator scripts, plugin documentation, and invariant tests are present.

## Compartmentalization

1. The plugin alone owns feedback lifecycle policy.
2. The server delegates feedback operations to the public plugin service.
3. The interface uses the HTTP boundary rather than raw plugin state.
4. The Stop hook derives its decision from the public plugin service.
5. Delivery receives a stable record ID rather than a feedback body.
6. Feedback text cannot become a shell command or authority override.
7. Host hook registration remains outside plugin-owned logic.
8. Clone-local state, locks, delivery events, and logs remain under ignored `.origin/`.
9. Dashboard Wiki content remains tracked Markdown rather than embedded interface copy.
10. Included and excluded responsibilities are explicit in nested instructions and docs.

## Delivery and Stopgate

1. Dashboard submission durably creates an actionable record.
2. Submission and server startup wake the local runner.
3. At most one runner owns delivery.
4. One in-progress record remains focused; otherwise the oldest open record is selected.
5. Feedback arriving during work joins the same queue.
6. Successful processes that make no progress retry with bounded backoff.
7. Unsuccessful processes retry with bounded backoff while the runner lease stays live.
8. Actionable feedback blocks Stop; corrupt state fails closed.
9. Genuine waiting permits Stop without pretending the record is resolved.
10. Evidence-backed completion drains the queue and returns the outcome to idle.

## Interface

1. The shipped canvas contains no domain page or workflow.
2. Wiki and Feedback controls remain available across routes.
3. Feedback captures kind, body, page path, and page label.
4. The ledger displays current records and lifecycle state.
5. Legal lifecycle actions are operable from the interface.
6. Headless delivery status, current record, and log path are visible.
7. Interrupted actionable delivery exposes a Wake action.
8. Keyboard focus is trapped and restored correctly in the modal.
9. Serious and critical automated accessibility violations are absent.
10. Repository Markdown renders with GFM support and unsafe links remain inert.

## Verification and integrity

1. Lint passes.
2. Formatting verification passes.
3. Type checking and production build pass.
4. Runtime and integration tests pass.
5. Interface and accessibility tests pass.
6. Enforced coverage thresholds pass.
7. Corruption, tampering, migration, backup, and recovery tests pass.
8. Concurrent writers, focus claims, and runner ownership tests pass.
9. The canonical plugin validator passes.
10. The production dependency audit reports no vulnerability at the configured severity.

## Installation and portability

1. Node and npm requirements are explicit and doctor-checked.
2. Git is explicit and doctor-checked.
3. One Node installer owns setup behavior.
4. Unix and PowerShell launchers delegate to that installer.
5. Repository line endings are deterministic across operating systems.
6. The server binds only to loopback addresses.
7. The foundation has no cloud, account, or synchronization requirement.
8. Diagnostics validate hooks, required files, ledger integrity, and agent configuration.
9. Linux, macOS, and Windows CI jobs all pass the same release contract.
10. A fresh clone completes documented setup, build, test, and startup checks.

## Authenticated Codex operation

1. The target machine finds the `codex` executable.
2. Codex authentication is accepted by a non-interactive execution.
3. `npm run acceptance:codex` reaches the production delivery adapter.
4. Codex retrieves the record through the public feedback command.
5. Codex performs the requested repository verification.
6. Codex resolves the record with concrete evidence.
7. The isolated queue returns to idle.
8. The isolated tracked worktree remains unchanged.
9. The user explicitly trusts the project Stop hook and observes it block actionable work.
10. A running dashboard drains multiple records, accepts a record during work, and resumes one after
    restart.

The first eight Codex criteria are checked by the isolated command where applicable. Criteria nine
and ten require the manual host-boundary sequence in [`CODEX-ACCEPTANCE.md`](CODEX-ACCEPTANCE.md).
