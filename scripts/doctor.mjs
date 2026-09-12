#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ensureAgentState } from "../.codex/plugins/_engagement-core/lib/state.mjs";
import { verifyFeedback } from "../.codex/plugins/_engagement-core/lib/service.mjs";
import { CHANNELS, pluginPresent } from "../.codex/plugins/_engagement-core/lib/scope.mjs";
import { inspectMachine } from "../.codex/plugins/_dashboard-runtime/lib/machine.mjs";
import { inspectGitHubRepositoryAccess } from "./github-repository-access.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [...inspectMachine().checks];
for (const [name, args] of [
  ["GitHub CLI", ["--version"]],
  ["GitHub authentication", ["auth", "status"]],
]) {
  const result = spawnSync("gh", args, { encoding: "utf8", shell: false });
  checks.push({
    name,
    ok: result.status === 0,
    detail: String(result.stdout || result.stderr || "gh is unavailable.")
      .trim()
      .slice(0, 500),
  });
}
checks.push(inspectGitHubRepositoryAccess({ cwd: root }));
try {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".codex/hooks.json"), "utf8"));
  const commands = hooks.hooks.Stop.flatMap((group) => group.hooks);
  for (const channel of CHANNELS) {
    checks.push({
      name: `${channel} Stop registration`,
      ok: commands.some(
        (h) =>
          h.type === "command" &&
          h.command ===
            `node "$(git rev-parse --show-toplevel)/scripts/channel-hook.mjs" ${channel}` &&
          h.timeout === 5,
      ),
    });
    const scope = { root, channel };
    if (!pluginPresent(scope)) {
      checks.push({ name: `${channel} removed; other channel remains independent`, ok: true });
      continue;
    }
    if (
      channel === "telegram-engagement" &&
      !fs.existsSync(path.join(root, ".origin/telegram-engagement/enabled.json"))
    ) {
      checks.push({ name: "Telegram optional activation is off", ok: true });
      continue;
    }
    ensureAgentState(scope);
    checks.push({ name: `${channel} journal`, ok: verifyFeedback(scope).valid });
  }
} catch (error) {
  checks.push({ name: "Channel integrity", ok: false, detail: error.message });
}
for (const check of checks)
  console.log(
    `${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`,
  );
if (checks.some((c) => !c.ok)) process.exitCode = 1;
else
  console.log(
    "Local prerequisites, GitHub work-unit access, and channel journals pass. Run Telegram doctor and the documented live acceptance separately; this does not prove hook trust or remote delivery.",
  );
