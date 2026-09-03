#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildAgentInvocation } from "../.codex/plugins/feedback-loop/lib/delivery.mjs";
import { verifyFeedback } from "../.codex/plugins/feedback-loop/lib/service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireAgent = process.argv.includes("--require-agent");
const checks = [];
const stopCommand =
  'node "$(git rev-parse --show-toplevel)/.codex/plugins/feedback-loop/hooks/stop.mjs"';
const stopCommandWindows =
  'for /f "delims=" %i in (\'git rev-parse --show-toplevel\') do @node "%i\\.codex\\plugins\\feedback-loop\\hooks\\stop.mjs"';

check("Node.js 22+", Number(process.versions.node.split(".")[0]) >= 22, process.version);
const npm = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], {
  encoding: "utf8",
  shell: false,
});
check("npm", npm.status === 0, npm.stdout.trim() || npm.error?.message);
const git = spawnSync("git", ["--version"], { encoding: "utf8", shell: false });
check("Git", git.status === 0, git.stdout.trim() || git.error?.message);

try {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".codex", "hooks.json"), "utf8"));
  const command = hooks?.hooks?.Stop?.[0]?.hooks?.[0];
  check(
    "Codex Stop registration",
    command?.type === "command" &&
      command?.command === stopCommand &&
      command?.commandWindows === stopCommandWindows &&
      command?.timeout === 5,
    "registered for Unix and Windows",
  );
} catch (error) {
  check("Codex Stop registration", false, error.message);
}

for (const relative of [
  ".codex/plugins/feedback-loop/hooks/stop.mjs",
  ".codex/plugins/feedback-loop/scripts/feedback.mjs",
  ".codex/plugins/feedback-loop/scripts/runner.mjs",
  ".codex/plugins/feedback-loop/voice.xml",
  ".codex/plugins/feedback-loop/data.schema.json",
])
  check(`Required file: ${relative}`, fs.existsSync(path.join(root, relative)), "present");
try {
  check("Feedback ledger", verifyFeedback(root).valid, JSON.stringify(verifyFeedback(root)));
} catch (error) {
  check("Feedback ledger", false, error.message);
}

const agentCommand = process.env.ORIGIN_AGENT_COMMAND?.trim() || "codex";
try {
  buildAgentInvocation("doctor-record-0001", process.env);
  check("Agent invocation configuration", true, "bounded and shell-free");
} catch (error) {
  check("Agent invocation configuration", false, error.message);
}
const agent = spawnSync(agentCommand, ["--version"], {
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
const agentReady = agent.status === 0;
check(
  "Agent command",
  agentReady || !requireAgent,
  agentReady
    ? agent.stdout.trim() || agentCommand
    : `${agentCommand} unavailable; dashboard works, automatic delivery requires it`,
);

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
} else console.log("Origin is ready.");

function check(name, ok, detail = "") {
  checks.push({
    name,
    ok: Boolean(ok),
    detail: String(detail || "")
      .replace(/\s+/g, " ")
      .slice(0, 300),
  });
}
