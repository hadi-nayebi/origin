#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAgentState, stopOutcome } from "../.codex/plugins/agent-stop-state/lib/state.mjs";
import { verifyFeedback } from "../.codex/plugins/contextual-feedback/lib/service.mjs";
import { inspectMachine } from "../.codex/plugins/_dashboard-runtime/lib/machine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const machine = inspectMachine();
for (const item of machine.checks) check(item.name, item.ok, item.detail);

try {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".codex", "hooks.json"), "utf8"));
  const hook = hooks?.hooks?.Stop?.[0]?.hooks?.[0];
  check(
    "Codex Stop registration",
    hook?.type === "command" &&
      hook?.command ===
        'node "$(git rev-parse --show-toplevel)/.codex/plugins/agent-stop-state/hooks/stop.mjs"' &&
      hook?.timeout === 5,
    "registered to agent-stop-state",
  );
} catch (error) {
  check("Codex Stop registration", false, error.message);
}

for (const relative of [
  ".codex/plugins/agent-stop-state/hooks/stop.mjs",
  ".codex/plugins/agent-stop-state/voice.xml",
  ".codex/plugins/agent-stop-state/data.schema.json",
  ".codex/plugins/contextual-feedback/scripts/feedback.mjs",
  ".codex/plugins/contextual-feedback/voice.xml",
  ".codex/plugins/contextual-feedback/data.schema.json",
  ".codex/plugins/_dashboard-runtime/lib/codex-wake-v1.mjs",
  ".codex/plugins/_dashboard-runtime/lib/wake-outbox.mjs",
  ".codex/plugins/_dashboard-runtime/scripts/start-harness.mjs",
])
  check(`Required file: ${relative}`, fs.existsSync(path.join(root, relative)), "present");

try {
  ensureAgentState(root);
  check("Agent state", Boolean(stopOutcome(root).mode), JSON.stringify(stopOutcome(root)));
} catch (error) {
  check("Agent state", false, error.message);
}
try {
  check("Feedback ledger", verifyFeedback(root).valid, JSON.stringify(verifyFeedback(root)));
} catch (error) {
  check("Feedback ledger", false, error.message);
}

for (const result of checks)
  console.log(
    `${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` — ${result.detail}` : ""}`,
  );
const failed = checks.filter((result) => !result.ok);
if (failed.length) {
  console.error(
    `Origin doctor found ${failed.length} blocking problem${failed.length === 1 ? "" : "s"}.`,
  );
  process.exitCode = 1;
} else console.log("Origin interactive dashboard and Codex harness are ready.");

function check(name, ok, detail = "") {
  checks.push({
    name,
    ok: Boolean(ok),
    detail: String(detail || "")
      .replace(/\s+/g, " ")
      .slice(0, 400),
  });
}
