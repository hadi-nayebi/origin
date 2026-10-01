# Origin test coverage ledger

This is a coverage record, not a release-wide acceptance certificate. Last reconciled: October 1,
2026 UTC (September 30 local). Released source baseline: `ac47035fbd3741023838fb0b6d96a9c5b98cd628`.

## How to read and maintain this record

Keep engineering tests separate from actual newcomer acceptance. **PASS** means the named case was
observed on its cited environment and revision. **PARTIAL** means only the listed parts passed.
**FAIL** means an observed result contradicted the expectation. **BLOCKED** means a named
prerequisite prevents execution. **NOT TESTED** means no sufficient evidence exists. A repaired
failure does not become a live PASS because its PR or CI passed.

For each new result, record the case, exact source revision and personal-clone tree, OS/tool
versions, inherited tools/login, ordinary user action, expected and observed result, evidence,
verdict, repair PR if relevant, remaining limitation and next test. Preserve prior failures and
supersede stale verdicts explicitly. Use redacted logs or a reproducible report linked in an issue
or PR; keep tokens, account identifiers, voice samples and private conversations out of Git.

The target user is a nontechnical professional who created a GitHub account during earlier
onboarding. Before the dashboard/agent handoff, they follow INSTALL without agent assistance. Their
existing account does not imply installed Git, Codex or signed-in local tools.

## Engineering evidence

Reviewed changes: [Full Access launcher #29](https://github.com/hadi-nayebi/origin/pull/29),
[first-audio enrollment #31](https://github.com/hadi-nayebi/origin/pull/31), and
[guided voice at pairing #33](https://github.com/hadi-nayebi/origin/pull/33). The full local check
on #33 head `cf45dcab897ca8c25b870624d21ea5831a03a66c` passed 141 runtime tests, 4 internal-voice
tests, 13 interface tests, lint, formatting, build and smoke. The exact head passed Linux, macOS and
Windows CI. Internal-voice tests check agent coaching, not synthesized speech quality. Speech-model
doubles do not certify real transcription or TTS.

| Scope                                                                                            | Evidence verdict                                    | Limit                                                                                    |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Lifecycle, schemas, hooks, runtime/outbox, installer prompts, pairing guide receipt and recovery | PASS: deterministic checks on the reviewed #33 head | Doubled services and isolated state are not an authenticated human journey.              |
| Interface and production smoke checks                                                            | PASS: same engineering check                        | Does not establish default-browser opening or actual Codex interaction.                  |
| Linux/macOS/Windows portable suite                                                               | PASS: exact-head CI on #33                          | Windows CI does not certify WSL2 installation or tmux desktop startup.                   |
| Real speech models and user assessment                                                           | NOT TESTED in this integrated release review        | FFmpeg conversion and fake models do not establish recognition, naturalness or identity. |

## Actual newcomer acceptance

The completed host run used Ubuntu Linux, Node 24.19.0, Git 2.43.0, tmux 3.4, Codex 0.159.2 and
GitHub CLI 2.45.0. Tools and personal GitHub/Codex login already existed. The personal repository
was made through GitHub's template controls, with fresh local dependencies/runtime and a separately
completed owner pairing. Its source baseline was `c3573715be14b04bbf70e512fb23b85abed745d5` and its
tree `c181f78165ba58bd3595c70e8eed9401499d21a1` matched that release exactly. This is current-host
evidence on that older baseline, not a clean-machine result for latest main. Detailed review
ownership and historical failures are tracked in
[Origin issue #20](https://github.com/hadi-nayebi/origin/issues/20).

| Case                                                                      | Verdict and observed result                                                                               | Remaining coverage / next action                                                                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earlier GitHub account onboarding                                         | NOT TESTED here; outside Origin's entry boundary                                                          | Validate the wider onboarding separately.                                                                                                                                              |
| Missing Git/bootstrap before cloning                                      | NOT TESTED; host Git was inherited                                                                        | Separate fresh OS/user environment following public instructions.                                                                                                                      |
| Own repository/template and normal terminal clone                         | PASS on cited older baseline: private template, default branch, correct writable remote and matching tree | Latest merged release repeat is in progress; fork/manual alternatives are NOT TESTED.                                                                                                  |
| Installer with existing tools/login                                       | PASS on cited older baseline: ordinary native terminal, full checks, complete banner and exit 0           | Does not cover missing tools, sign-in or a novice completing unaided.                                                                                                                  |
| Missing GitHub CLI, Node/npm, tmux or Codex                               | NOT TESTED as a newcomer                                                                                  | Isolated missing-kit tests; do not uninstall owner tools to simulate absence.                                                                                                          |
| Unauthenticated GitHub/Codex login                                        | NOT TESTED; existing login reused                                                                         | New isolated user state; owner must complete personal authentication.                                                                                                                  |
| Unsupported Node recovery                                                 | PARTIAL: rejection observed with Node 22.21 in engineering                                                | Native newcomer recovery and supported installation remain NOT TESTED.                                                                                                                 |
| Optional Telegram choice and hidden token input                           | PASS on cited older baseline: offered in installer, explicit yes, hidden entry                            | Latest guide repeat and skip/cancel branches need independent live cases.                                                                                                              |
| Pairing expiry and retry                                                  | PASS on cited older baseline: expiry failed without completion; documented retry paired                   | Wrong command, other-owner input and interruption variants NOT TESTED live.                                                                                                            |
| Installation repeat                                                       | PASS on cited older baseline: binding preserved, exit 0                                                   | Broader upgrade/reinstall variants NOT TESTED.                                                                                                                                         |
| Dashboard and interactive agent/context                                   | PARTIAL: dashboard rendered; correct native Codex read context, hooks active                              | Automatic default-browser opening remains NOT TESTED.                                                                                                                                  |
| Full Access launcher default                                              | PARTIAL: manual owner-requested Full Access verified in old run; shipped default has green #29 checks     | Actual fresh merged launcher `/status` verification pending.                                                                                                                           |
| Folder/hook trust                                                         | PASS on cited older baseline: owner approved and three documented hooks active                            | Fresh clone follows its visible trust controls; does not certify adversarial isolation.                                                                                                |
| Four-step guide                                                           | PARTIAL: all steps inspected and finished                                                                 | Skip/replay/reload and separate-browser first-run variants NOT TESTED.                                                                                                                 |
| Origin Telegram text round trip                                           | PASS on cited older baseline: input woke same worker, reply sent, owner's Yes returned in same thread     | Closure, competing requests and recovery remain separate cases.                                                                                                                        |
| Audio as ordinary text-mode material                                      | PARTIAL: three-second voice file preserved; speech disabled                                               | Contents were not transcribed or understood. This is not voice activation acceptance.                                                                                                  |
| Guided text/voice explanation after pairing                               | NOT TESTED live on latest release                                                                         | Verify terminal guide and actual paired Telegram receipt after fresh pairing.                                                                                                          |
| Voice dependencies, sample, transcript, preview and replies               | NOT TESTED live                                                                                           | Activate local speech, read recommended passage, inspect actual transcript and listen to preview; text stays available.                                                                |
| Repository protections                                                    | BLOCKED: browser confirmation was rejected; rules remained unsaved                                        | After agent handoff, explain and complete the owner's settings action; verify before page work.                                                                                        |
| Feedback → one page → preview → PR → owner merge                          | BLOCKED by startup/protection gate; no page work in this restart                                          | Execute one bounded About-page journey after prerequisites pass.                                                                                                                       |
| Clarification/correction, busy queue, draft/route context and attachments | NOT TESTED in this restart                                                                                | Individual cases after the first page journey.                                                                                                                                         |
| Review/reopen, mode/Stop indicators, channel pause/removal                | NOT TESTED live in this restart                                                                           | Individual durable-history and channel-independence cases.                                                                                                                             |
| Outbox/restart/session-resume/corruption recovery                         | NOT TESTED live in this restart                                                                           | Deterministic coverage is separate; execute fault/recovery cases without deleting history.                                                                                             |
| Keyboard, responsive and accessibility use                                | PARTIAL: deterministic interface suite                                                                    | Actual browser keyboard/mobile-width review remains pending.                                                                                                                           |
| Full fresh released repeat                                                | NOT TESTED complete                                                                                       | Fresh personal template matches `ac47035`; 141 runtime, 4 internal-voice, 13 UI and build/doctor checks passed. Installer waits at hidden token input; pairing/startup/voice untested. |
| macOS and WSL2 newcomer journeys                                          | NOT TESTED live                                                                                           | Use separate supported machines/environments; portable CI cannot pass these rows.                                                                                                      |
| Independent novice usability                                              | NOT TESTED                                                                                                | A professional following shipped instructions without tester-only knowledge should report steps and difficulties.                                                                      |

Earlier hidden wrappers and API provisioning were withdrawn as newcomer acceptance evidence. Their
failure observations remain useful engineering leads. Do not restore their PASS claims.

## Observed new-chat launcher failure

On the fresh Ubuntu personal clone matching released runtime `ac47035`, running the documented
`npm run origin:new` while its Full Access Codex was already running returned to the same
conversation and session. **FAIL** for that branch; selecting a new-chat command in a unit test did
not cover reuse of a live pane. The repair rejects this conflicting request with an explicit
finish/exit/retry instruction, preserves existing work, and starts fresh after Codex exits.
Candidate engineering regression coverage is separate from the pending merged-release native retest.

## Isolated environment coverage

A Python virtual environment isolates Python packages, not operating-system Git/tmux/Codex,
GitHub/Codex credentials, the browser or desktop terminal. Use separate disposable OS/user state for
missing-kit and unauthenticated cases. A container can evaluate package installation and local
configuration; a desktop VM or separate machine is needed for desktop/browser handoff evidence.

No isolated newcomer run has passed yet. Existing Docker and QEMU availability is feasibility only.
Before a run, describe what is absent, what is inherited or mounted, exact OS image/revision,
network and privilege assumptions, allowed write locations, and which cases it can legitimately
prove. Do not mount owner credentials or change host login to obtain a synthetic clean result.
Authentication remains a human step. Label environment limitations before execution.

## Field reports and next evidence

Contributors can open an issue using [CONTRIBUTING](../CONTRIBUTING.md), naming a case above,
OS/tool versions, Origin commit, inherited setup, exact ordinary steps, expected/actual result,
redacted evidence and whether a fresh retry reproduces it. A report is a lead until reproduced or
reviewed against sufficient evidence. Update the corresponding row rather than convert one person's
success into platform-wide certification. Maintain coverage for the
[complete live contract](CODEX-ACCEPTANCE.md) and the [two-channel review](TWO-CHANNEL-REVIEW.md);
these references supply detailed mechanisms beyond this newcomer summary. New features must add
cases and explicit untested scope.
