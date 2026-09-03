#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertMachineReady } from "../.codex/plugins/_dashboard-runtime/lib/machine.mjs";
import { deliverCodexWake } from "../.codex/plugins/_dashboard-runtime/lib/codex-wake-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = "[ORIGIN ACCEPTANCE — TMUX]";

try {
  assertMachineReady();
  const result = deliverCodexWake(root, {
    marker,
    prompt: `${marker}\nThis bounded message verifies that Origin can address the same interactive Codex session through its repository-scoped tmux transport. Do not change project files for this message.`,
  });
  console.log(`PASS  Authenticated interactive Codex kit`);
  console.log(`PASS  Repository-scoped tmux delivery — ${result.state}`);
  console.log(`PASS  Target session — ${result.session} ${result.pane}`);
  console.log(
    "Complete the feedback question, answer, review, acceptance, and reopening scenario in docs/CODEX-ACCEPTANCE.md before claiming full live acceptance.",
  );
} catch (error) {
  console.error(`FAIL  Live Codex/tmux acceptance — ${error.message}`);
  process.exitCode = 1;
}
