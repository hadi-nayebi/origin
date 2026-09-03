# Origin 1.0 quality contract

Origin calls a criterion complete only when it maps to executed or directly inspected evidence. A
reported `10/10` means all ten published criteria for that dimension passed on the cited revision.
Unavailable live evidence is recorded as unavailable, never inferred from CI.

| Dimension           | Release claim                                                                                                                                                    | Evidence                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Academy alignment   | Origin is the Hadosh Base Dashboard substrate for Phases 6–7 and continues an approved web-to-CLI handoff                                                        | README, handoff template, Wiki, agent instructions              |
| Session model       | Dashboard and terminal address one persistent interactive Codex tmux session                                                                                     | Launcher, pane resolver, local live acceptance                  |
| Plugin anatomy      | Feedback cognition, global Stop state, and runtime transport have separate ownership                                                                             | Two plugin trees, runtime boundary, schemas, voice, docs, tests |
| Feedback lifecycle  | Raw input survives interpretation, work, questions, answers, verification, acceptance, and reopening                                                             | Ledger/schema tests, API and UI tests                           |
| Stop and waiting    | Runnable work blocks Stop; waiting is legitimate only when no other runnable work exists                                                                         | State/plugin/hook tests                                         |
| Delivery durability | Events persist before wake; nonterminal events are never count-evicted; process-safe claims, busy queueing, immediate retry, and recovery prevent transport loss | Runtime and outbox tests                                        |
| Security            | Loopback/same-origin server, bounded pointers, no feedback shell interpolation, no approval bypass                                                               | API tests, adapter tests, `SECURITY.md`                         |
| Interface           | Empty canvas, Wiki, future-route context, feedback threads, red attention state, answer, acceptance, and reopening                                               | UI and accessibility tests                                      |
| Internal voices     | Event voices restate plugin objective, durable context, cognitive operation, authority, and next boundary while code retains enforcement                         | Voice catalog and instruction tests                             |
| Installation        | macOS/Linux/WSL2 prerequisites are strict; missing Codex, auth, or tmux blocks launch                                                                            | Machine inspection, doctor, installer tests                     |
| Recovery            | Durable ledger, backups, global state, runtime record, and wake outbox are inspectable                                                                           | Corruption, backup/restore, stale work, retry tests             |

`npm run check` is the reproducible deterministic evidence suite. GitHub Actions runs it on Linux,
macOS, and Windows; Windows CI tests portable code but does not claim the full tmux runtime, which
runs inside WSL2.

`npm run acceptance:codex` is the real machine transport check. The complete human/agent lifecycle
is documented in [`CODEX-ACCEPTANCE.md`](CODEX-ACCEPTANCE.md).
