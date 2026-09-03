# Origin 1.0 quality contract

Origin calls a dimension complete only when its claim maps to executable or inspectable evidence.
Scores are not substitutes for evidence.

| Dimension                 | Release claim                                                                                        | Evidence                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Product boundary          | One user, empty canvas, Wiki, Feedback                                                               | UI tests and canonical README                                     |
| Topic agnosticism         | No domain pages or workflows ship                                                                    | Tracked dashboard and wiki review                                 |
| Plugin anatomy            | One objective with manifest, contracts, policy, state, actions, voice, hooks, docs, and tests        | Canonical plugin validator and plugin tree                        |
| Compartmentalization      | Server transports; plugin owns feedback cognition; adapter owns delivery                             | Imports, nested `AGENTS.md`, integration tests                    |
| State integrity           | Atomic hash-chained ledger with validation and one focused record                                    | Tamper, chronology, transition, and concurrent-writer tests       |
| Deterministic enforcement | Actionable feedback blocks Stop; waiting and idle are explicit                                       | Exact Stop-event tests                                            |
| Security                  | Loopback/same-origin boundary; no raw feedback in process arguments; no shell                        | API security and invocation tests; `SECURITY.md`                  |
| Test quality              | Unit, corruption, migration, rollback, concurrency, subprocess, API, DOM, and accessibility coverage | Enforced line, branch, and function thresholds in `npm run check` |
| Documentation             | Human and agent surfaces describe the same current system                                            | README, plugin docs, Wiki, quality contract                       |
| Interface quality         | Responsive empty canvas, GFM Wiki, accessible feedback management                                    | DOM interaction and automated accessibility tests                 |
| Installation portability  | One Node installer, thin Unix and PowerShell launchers, and explicit cross-platform line endings     | Installer tests, `.gitattributes`, and three-OS CI matrix         |
| Continuous delivery       | New feedback starts one durable runner; active work remains gated; stale focus recovers              | Runner, lease, subprocess, and recovery tests                     |
| Stable readiness          | Reproducible install, verification, diagnostics, recovery, and explicit boundaries                   | Lockfile, CI, doctor, backup/restore, threat model                |

The GitHub Actions matrix is the authoritative native evidence for Linux, macOS, and Windows. A
release is not green while any matrix job fails.
