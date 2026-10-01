# Origin test coverage ledger

This is a coverage record, not a release-wide acceptance certificate. Last reconciled: October 1,
2026 UTC (September 30 local). Current merged repository baseline:
`ce6b119a21a86beac345d2e596f7151ad4482a87`. Each acceptance result below retains the exact older
revision it actually exercised.

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

| Case                                                                      | Verdict and observed result                                                                                         | Remaining coverage / next action                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Earlier GitHub account onboarding                                         | NOT TESTED here; outside Origin's entry boundary                                                                    | Validate the wider onboarding separately.                                                                                                                          |
| Missing Git/bootstrap before cloning                                      | NOT TESTED; host Git was inherited                                                                                  | Separate fresh OS/user environment following public instructions.                                                                                                  |
| Own repository/template and normal terminal clone                         | PASS on fresh merged retest: personal head/tree matched source `5512b77d` exactly                                   | Fork/manual alternatives remain NOT TESTED.                                                                                                                        |
| Installer with existing tools/login                                       | PASS on fresh merged retest: ordinary native terminal, full checks, default Telegram skip, exit 0                   | Existing tools/login were inherited; missing-kit, sign-in and unaided novice use remain NOT TESTED.                                                                |
| Missing GitHub CLI, Node/npm, tmux or Codex                               | NOT TESTED as a newcomer                                                                                            | Isolated missing-kit tests; do not uninstall owner tools to simulate absence.                                                                                      |
| Unauthenticated GitHub/Codex login                                        | NOT TESTED; existing login reused                                                                                   | New isolated user state; owner must complete personal authentication.                                                                                              |
| Unsupported Node recovery                                                 | PARTIAL: rejection observed with Node 22.21 in engineering                                                          | Native newcomer recovery and supported installation remain NOT TESTED.                                                                                             |
| Optional Telegram choice and hidden token input                           | PASS on cited older baseline: offered in installer, explicit yes, hidden entry                                      | Latest pre-choice text/voice explanation observed; token cancellation and no-choice completion observed in fresh ac47035 run. Post-pairing guide remains untested. |
| Pairing expiry and retry                                                  | PASS on cited older baseline: expiry failed without completion; documented retry paired                             | Wrong command, other-owner input and interruption variants NOT TESTED live.                                                                                        |
| Installation repeat                                                       | PASS on cited older baseline: binding preserved, exit 0                                                             | Broader upgrade/reinstall variants NOT TESTED.                                                                                                                     |
| Dashboard and interactive agent/context                                   | PARTIAL on fresh merged retest: dashboard rendered manually; correct context, hooks, reuse and saved-session resume | Automatic default-browser opening, pending-wake recovery and runnable-work restart remain NOT TESTED.                                                              |
| Full Access launcher default                                              | PASS on fresh merged retest: shipped launcher/status reported Full Access; three trusted hooks active               | Healthy reuse and idle-worker new-chat refusal/exit/retry passed; preservation during a substantive busy turn remains NOT TESTED.                                  |
| Folder/hook trust                                                         | PASS on cited older baseline: owner approved and three documented hooks active                                      | Fresh clone follows its visible trust controls; does not certify adversarial isolation.                                                                            |
| Four-step guide                                                           | PARTIAL: fresh ac47035 replay, next/back, Feedback/Admin shortcuts, finish and skip followed by reload observed     | Stored completion inherited. Reload closes replay; no saved replay-progress promise. Separate-browser first-run remains NOT TESTED.                                |
| Origin Telegram text round trip                                           | PASS on cited older baseline: input woke same worker, reply sent, owner's Yes returned in same thread               | Closure, competing requests and recovery remain separate cases.                                                                                                    |
| Audio as ordinary text-mode material                                      | PARTIAL: three-second voice file preserved; speech disabled                                                         | Contents were not transcribed or understood. This is not voice activation acceptance.                                                                              |
| Guided text/voice explanation after pairing                               | NOT TESTED live on latest release                                                                                   | Verify terminal guide and actual paired Telegram receipt after fresh pairing.                                                                                      |
| Voice dependencies, sample, transcript, preview and replies               | NOT TESTED live                                                                                                     | Activate local speech, read recommended passage, inspect actual transcript and listen to preview; text stays available.                                            |
| Repository protections                                                    | BLOCKED: browser confirmation was rejected; rules remained unsaved                                                  | After agent handoff, explain and complete the owner's settings action; verify before page work.                                                                    |
| Feedback → one page → preview → PR → owner merge                          | BLOCKED by startup/protection gate; no page work in this restart                                                    | Execute one bounded About-page journey after prerequisites pass.                                                                                                   |
| Clarification/correction, busy queue, draft/route context and attachments | NOT TESTED in this restart                                                                                          | Individual cases after the first page journey.                                                                                                                     |
| Review/reopen, mode/Stop indicators, channel pause/removal                | NOT TESTED live in this restart                                                                                     | Individual durable-history and channel-independence cases.                                                                                                         |
| Outbox/restart/session-resume/corruption recovery                         | PARTIAL: empty-channel pause persisted; explicit resume and saved-session resume passed                             | Pending-wake, queued-input, runnable-work and corruption recovery remain NOT TESTED live.                                                                          |
| Keyboard, responsive and accessibility use                                | PARTIAL: Feedback keyboard controls and bounded 390×844 views passed; Admin tabs failed on source `5512b77d`        | PR #44 repair is engineering-green and merged; fresh native keyboard retest, screen-reader behavior and other widths remain NOT TESTED.                            |
| Full fresh released repeat                                                | PARTIAL on exact source/tree `5512b77d`: install, dashboard, Full Access, reuse, new-chat and resume paths passed   | Missing-kit/login, automatic browser opening, busy-turn preservation, guided pairing/voice, protections and the complete page/PR/merge journey remain NOT TESTED.  |
| macOS and WSL2 newcomer journeys                                          | NOT TESTED live                                                                                                     | Use separate supported machines/environments; portable CI cannot pass these rows.                                                                                  |
| Independent novice usability                                              | NOT TESTED                                                                                                          | A professional following shipped instructions without tester-only knowledge should report steps and difficulties.                                                  |

Earlier hidden wrappers and API provisioning were withdrawn as newcomer acceptance evidence. Their
failure observations remain useful engineering leads. Do not restore their PASS claims.

## Observed new-chat launcher failure

On a fresh Ubuntu personal clone matching released source
`ac47035fbd3741023838fb0b6d96a9c5b98cd628`, running the documented `npm run origin:new` while its
Full Access Codex was already running returned to the same conversation and session. **FAIL** for
that branch. The run used inherited Node 24.19.0, tmux 3.4, Codex 0.159.2, Git 2.43.0, GitHub CLI
2.45.0, and existing GitHub/Codex login. The exact personal-clone commit/tree and Ubuntu release
were not captured for this event, so this row is incomplete evidence and must not be promoted to a
reproducible live PASS. Selecting a new-chat command in a unit test did not cover reuse of a live
pane. The merged repair rejects the conflict with an explicit finish/exit/retry instruction and
preserves existing work. Candidate engineering regression coverage and the pending merged-release
native retest remain separate from this historical failure.

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

## Additional independent Admin and Feedback form observations

This run used personal clone 10 matching released source `ac47035fbd3741023838fb0b6d96a9c5b98cd628`,
an actual 390×844 CSS viewport, and inherited Node 24.19.0, Git 2.43.0, tmux 3.4, Codex 0.159.2,
GitHub CLI 2.45.0, existing GitHub/Codex login and browser state. Detailed screenshots and steps
remain in the private stabilization evidence packet `engineering/10-admin-feedback-independent.md`;
it is a locator, not public evidence. The exact personal-clone commit/tree, Ubuntu release and
Chrome version were not captured. Treat these as bounded observations, not reproducible live PASS
evidence, and do not publish the private packet.

On that personal clone, ordinary Chrome controls opened all ten Wiki chapters. Each selected chapter
was verified only after its exact heading loaded, with nonempty article content. Both reference
plugin detail pages rendered their correct headings and anatomy. System showed Ready, idle, Stop
allowed, schema 4 verified, zero feedback records/events, zero pending wakes and two complete
reference plugins. These are bounded rendering/navigation observations, not proof of the documented
runtime mechanisms.

An empty Feedback Save was refused by the required textarea's native validation; it focused the
field and displayed the browser's missing-value message. The displayed context identified Admin /
Plugins / Telegram Engagement. No nonempty request was submitted, so persisted route, worker
delivery and page implementation remain untested. After this check System still showed zero
records/events/pending wakes. Returning to Canvas rendered the empty start page.

Closing and reopening an unsaved Feature request draft cleared its text. Record that behavior
separately: it does not exercise draft survival during worker worktree creation or establish a
promised persistence contract. Initial rapid chapter snapshots caught the previous article before
asynchronous loading completed; those observations were disqualified and rerun waiting for the
selected heading.

The acceptance table contains 27 grouped coverage rows: 8 PASS, 7 PARTIAL, 10 NOT TESTED and 2
BLOCKED. These totals are summary scopes rather than an exhaustive individual-test count. Explicit
new-chat behavior separately failed during the live launcher review;
[repair #38](https://github.com/hadi-nayebi/origin/pull/38) refuses silent reuse of a running
conversation. Its merged native retest passed for the bounded idle-worker refusal/exit/retry path;
preservation during a substantive busy turn remains untested. Protection and voice decisions do not
block independent read-only and form checks.

## Fresh merged launcher retest

After owner merge of #36 and #38, source main `5512b77d5877018085d0bb557eb0f3a26fa5b10a` was
verified before a new personal template/native-terminal clone. Personal head
`5daf87b19dd32bb0b9c342820cc390e231dd6fac`, tree `726c917f59f719ab376c2110baf4695064e8ad7e`, matched
that release exactly. The existing-host run inherited Node 24.19.0, Git 2.43.0, tmux 3.4, Codex
0.159.2, GitHub CLI 2.45.0, GitHub/Codex login and browser state. Dependencies and runtime were
fresh, with temporary and cache paths restricted to the clone. The Ubuntu release and Chrome version
were not captured, so this is bounded current-host evidence rather than reproducible
clean-environment acceptance. Missing-kit coverage remains untested.

The unchanged native installer passed 142 runtime, 4 internal voice and 13 interface checks, lint,
formatting, build, smoke and doctor. Default Enter at optional Telegram setup skipped it and
completed with exit 0. No pairing was requested or inherited. The launcher correctly refused another
clone's occupied port 5173; its displayed `ORIGIN_PORT` recovery started the correct dashboard and
worker on port 5174. Native trust screens enabled PreToolUse 1/1 and Stop 2/2. Actual/status showed
Full Access.

Normal reuse retained the existing session. Explicit `origin:new` refused the live worker with
finish/exit/retry instructions and left its session unchanged. Ctrl-D at idle then retry opened a
distinct new Full Access session in the same clone. This supersedes the silent-reuse failure for the
bounded fresh merged idle-worker case. Preservation during a substantive busy turn remains separate
coverage. Browser rendering was observed through manual opening; automatic browser opening is still
unverified.

Empty dashboard Pause persisted after reload and loaded-state inspection; explicit Resume returned
to idle. Immediate reload snapshots briefly show default state before asynchronous retrieval, so
wait for loaded state before assessing persistence. Queued-input recovery and independent active
Telegram behavior were not exercised. The new worker read context and identified missing branch
protections before page work. The clone stayed clean, with no page request or settings changes.

The explicit `origin:resume` alias also restored the newest saved session after idle Ctrl-D exit,
including its prior readiness prompt and response. This is bounded stopped-foreground resume
coverage; it does not prove recovery of pending wakes or runnable work.

## Admin tab keyboard failure and merged repair

On Ubuntu, ordinary Chrome keyboard input against the fresh personal clone matching released source
`5512b77d5877018085d0bb557eb0f3a26fa5b10a` left focus on the selected System tab after Left Arrow.
Wiki, Plugins and System all had `tabIndex=0`. **FAIL** for the Admin tab keyboard case; the other
bounded keyboard observations do not pass this case. Later test/documentation merges through
`d749b5c` did not change this Admin implementation.

The [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) calls for Left/Right focus
movement with wrapping and one tab stop in the tab list. Manual activation fits Origin because
switching sections can fetch content: arrows move focus, and Enter/Space select the section. Merged
[repair #44](https://github.com/hadi-nayebi/origin/pull/44) adds those controls, Home/End, and
labelled associated tab panels. Its regression failed on the unchanged implementation, then passed
with the repair. The full local engineering check covers 142 runtime tests, four internal voice
tests, 14 interface tests, lint, formatting, TypeScript/Vite build and production startup smoke.
These checks use Node24 and clone-local scratch paths; dependencies were reused in the engineering
clone. They are not fresh native acceptance. The subsequent bounded fresh released keyboard retest
is recorded below.

The same unchanged personal clone's System view was readable at a measured 390×844 viewport with no
horizontal overflow; viewport override was reset afterward. This is one bounded responsive view, not
complete accessibility or all-width coverage. Screen-reader behavior remains untested.

## Fresh merged Admin keyboard and read-only route retest

PR44 merged as `ce6b119a21a86beac345d2e596f7151ad4482a87`. A new private personal repository was
created through GitHub's template controls, default branch only, then cloned in the ordinary native
terminal into a new directory. Its commit `2f6c1d5edfa21fe8765fda0fcbc0b507147b3a9f` and tree
`17fe6dbc9440e70604c6aa7d1ce25b241cff0030` exactly match that released source tree. The host is
Ubuntu24.04.3 with inherited Node24.19.0, Git2.43.0, tmux3.4, Codex0.159.2, GitHub CLI2.45.0 and
existing logins. Chrome was used; its exact version was not captured. Browser storage was inherited.
Dependencies, runtime and pairing were not copied from another clone; scratch/cache paths stayed
within this clone.

The native installer passed142 runtime,4 internal voice,14UI and the complete lint/format/build/
smoke/doctor checks. Enter at the default optional Telegram choice skipped it; the completion banner
appeared and installer exit0 was observed. Startup used the documented alternative port 5175 because
prior independent test dashboards occupied5173/5174. Actual native `/status` showed Full Access and
the correct clone/session; `/hooks` showed PreToolUse1/1 and Stop2/2 active. The dashboard was
opened manually at its displayed address; automatic browser opening remains unverified. This is
current-host evidence, not missing-tool or fresh-machine acceptance.

**PASS, bounded Admin keyboard repair:** selecting System, then pressing Left Arrow moved focus to
Plugins without selecting it. Home/End and right-side wrapping moved focus while System remained
selected. Enter selected Plugins; Space selected System. Only the selected tab had `tabIndex=0`; Tab
moved into its labelled associated System panel. The original failure no longer reproduced.
Screen-reader behavior and complete accessibility remain untested.

**PASS, bounded read-only navigation:** reload preserved `/admin/system`, the Telegram-plugin detail
and the Welcome Wiki chapter with their expected loaded headings. Browser Back returned from plugin
detail to the Plugins landing view; Forward restored the detail. The documented `/wiki/01-welcome`
compatibility URL rendered Welcome inside Admin. Early asynchronous snapshots of plugin navigation
were not counted until the selected heading loaded. An initial test waited for the wrong heading,
`System status`, and timed out; corrected to the actual `Origin system status` before the keyboard
case. That tester selector mistake is not a product failure.

No nonempty Feedback, page work, pairing, protection change or owner merge was performed in this
clone. Protections remain absent; real speech, missing-tool/login branches, the generated-page
workflow and the complete fresh repeat remain unpassed. Private case evidence is kept under
`Origin Tests/2026-10-01/15-installation-merged-admin-keyboard` and dated engineering notes; no
credentials, conversations or voice samples belong in this public ledger.
