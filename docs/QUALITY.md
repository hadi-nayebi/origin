# Origin 1.0 quality contract

Origin calls a criterion complete only when it maps to executed or directly inspected evidence. A
reported `10/10` means all ten published criteria for that dimension passed on the cited revision.
Unavailable live evidence is recorded as unavailable, never inferred from CI.

| Dimension           | Release claim                                                                                                                                                    | Evidence                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Academy alignment   | Origin is the Hadosh dashboard-plus-harness substrate for Phases 6–7 and continues an approved web-to-CLI handoff                                                | README, handoff template, Wiki, agent instructions              |
| Session model       | Dashboard and terminal address one persistent interactive Codex tmux session                                                                                     | Launcher, pane resolver, local live acceptance                  |
| Plugin anatomy      | Feedback cognition, independent channel Stop states, and runtime transport have separate ownership                                                               | Two plugin trees, runtime boundary, schemas, voice, docs, tests |
| Feedback lifecycle  | Raw input survives interpretation, isolated branch work, questions, answers, verification, PR merge acceptance, and reopening                                    | Ledger/schema/work-unit/API/UI tests                            |
| Stop and waiting    | Runnable work blocks Stop; waiting is legitimate only when no other runnable work exists                                                                         | State/plugin/hook tests                                         |
| Delivery durability | Events persist before wake; nonterminal events are never count-evicted; process-safe claims, busy queueing, immediate retry, and recovery prevent transport loss | Runtime and outbox tests                                        |
| Security            | Loopback/same-origin server, bounded pointers, no feedback shell interpolation, repository-bound PR broker, and trusted agent merge denial                       | API, work-unit and hook tests, `SECURITY.md`                    |
| Interface           | Empty canvas, Admin Wiki/Plugins, future-route context, feedback threads, linked PR, owner merge, answer, and reopening                                          | UI and accessibility tests                                      |
| Internal voices     | Event voices restate plugin objective, durable context, cognitive operation, authority, and next boundary while code retains enforcement                         | Voice catalog and instruction tests                             |
| Installation        | macOS/Linux/WSL2 prerequisites are strict; Codex/tmux block launch and GitHub CLI/auth block the reviewed PR workflow                                            | Machine inspection, doctor, installer tests                     |
| Recovery            | Durable ledger, backups, owning channel state, runtime record, and wake outbox are inspectable                                                                   | Corruption, backup/restore, stale work, retry tests             |

`npm run check` is the reproducible deterministic evidence suite. GitHub Actions runs it on Linux,
macOS, and Windows; Windows CI tests portable code but does not claim the full tmux runtime, which
runs inside WSL2.

`npm run acceptance:codex` is the real machine transport check. The complete human/agent lifecycle
is documented in [`CODEX-ACCEPTANCE.md`](CODEX-ACCEPTANCE.md).

Development-server checks also exercise Vite's HTML transformation and its matching CSP nonce.
Development permits nonce-bearing startup scripts/styles and loopback WebSocket hot reload;
production retains its self-only policy. A served HTML shell or passing production build alone does
not establish that the normal development dashboard renders in a browser.

After `npm run build`, install Chromium with `npx playwright install chromium` and run
`npm run test:browser`. This checks development and production rendering, Admin Wiki/Plugins
navigation, page-aware feedback, question/answer, PR-merge acceptance and mobile width in isolated
local state with tmux delivery disabled and a simulated GitHub result. Linux CI runs it. It does not
replace authenticated Codex/hook/GitHub acceptance.
