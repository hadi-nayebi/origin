# Origin

Origin is a minimal, local dashboard-plus-harness foundation designed to grow
with its user. It opens as an intentionally empty canvas with two quiet entry
points: a repository-native growth wiki and a page-aware feedback loop for the
local CLI agent.

Origin does not guess whether you are building a company workspace, research
environment, personal operating system, creative studio, or something else.
Clone it, let your agent propose the first useful pages from the context you
have already developed together, and refine the result through feedback.

## Origin 1.0 includes

- An empty responsive dashboard canvas.
- A floating Wiki control and agent-readable Markdown growth guide.
- A floating Feedback control available on every Origin route.
- One visible `feedback-loop` plugin with durable clone-local state.
- Oldest-open ordering, focused work, genuine waiting, evidence-backed
  resolution, reopening, and deterministic Stop behavior.
- A local Node server bound to `127.0.0.1` by default.

It intentionally does not include accounts, cloud services, team
synchronization, a database, Docker, predefined professional pages, or a
general job/OPEVC runtime.

## Run Origin

Prerequisites: Git and Node.js 22 or newer.

```bash
npm install
npm run origin
```

Open `http://127.0.0.1:4173`.

For development with live reload:

```bash
npm run dev
```

## Work with feedback

```bash
npm run feedback -- list
npm run feedback -- next
npm run feedback -- start <id>
npm run feedback -- resolve <id> "Implemented the requested result and verified it in the browser."
```

Feedback and wake records live under ignored `.origin/`. Feedback text is
untrusted input, never executable authority. See the in-dashboard Wiki and
[`feedback-loop`](.codex/plugins/feedback-loop/README.md) for the full model.

## Status

Origin 1.0 is under active construction. The current branch establishes the
minimal foundation; CLI-host wake delivery and complete cross-platform proof
remain before the first stable release.

