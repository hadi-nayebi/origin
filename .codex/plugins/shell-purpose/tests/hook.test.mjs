import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { commandText, respond, validPurpose } from "../hook.mjs";
import { renderVoice, voiceIds } from "../voices.mjs";
const hook = new URL("../hook.mjs", import.meta.url);
const purpose = "Inspect the working tree before making edits.";
const command = `# Purpose: ${purpose}\ngit status --short`;
const event = (value) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: value },
});
const invoke = (input) => spawnSync(process.execPath, [hook.pathname], { input, encoding: "utf8" });

test("missing purpose is denied, corrected retry abstains, and commands never execute", () => {
  const denied = invoke(JSON.stringify(event("printf marker")));
  assert.equal(denied.status, 0);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.stdout, /correct.*header/);
  const valid = invoke(JSON.stringify(event(command)));
  assert.equal(valid.status, 0);
  assert.equal(valid.stdout, "");
  assert.equal(valid.stderr, "");
});

test("exact heading, size, control characters and actual command are checked", () => {
  assert.ok(validPurpose(command));
  for (const size of [20, 240]) assert.ok(validPurpose(`# Purpose: ${"x".repeat(size)}\ntrue`));
  for (const size of [0, 19, 241])
    assert.equal(validPurpose(`# Purpose: ${"x".repeat(size)}\ntrue`), false);
  assert.ok(validPurpose(`# Purpose: ${"😀".repeat(20)}\ntrue`));
  for (const bad of [
    null,
    {},
    "",
    ` # Purpose: ${purpose}\ntrue`,
    `# purpose: ${purpose}\ntrue`,
    `echo first\n# Purpose: ${purpose}\ntrue`,
    `# Purpose: ${purpose}`,
    `# Purpose: ${purpose}\n# only comments`,
    `# Purpose: ${purpose}\u0000\ntrue`,
    `# Purpose: ${" ".repeat(30)}\ntrue`,
  ])
    assert.equal(validPurpose(bad), false);
  assert.ok(validPurpose(`# Purpose: ${purpose}\r\ntrue`));
});

test("native command and recognized shell argv shapes are validated", () => {
  assert.equal(commandText(command), command);
  for (const shell of ["bash", "/bin/bash", "sh", "zsh"]) {
    assert.equal(respond(event([shell, "-lc", command])), null);
    assert.equal(
      respond(event([shell, "-c", "true"])).hookSpecificOutput.permissionDecision,
      "deny",
    );
  }
  for (const bad of [[], ["echo", command], ["bash", "-c"], ["bash", 1], [command]]) {
    assert.equal(commandText(bad), null);
    assert.equal(respond(event(bad)).hookSpecificOutput.permissionDecision, "deny");
  }
});

test("lifecycle events restore bounded owned voices, including compact and resume", () => {
  for (const source of ["startup", "resume", "clear", "compact"]) {
    const result = JSON.parse(
      invoke(JSON.stringify({ hook_event_name: "SessionStart", source })).stdout,
    );
    assert.equal(result.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(result.hookSpecificOutput.additionalContext, new RegExp(`Event: ${source}`));
  }
  for (const name of ["UserPromptSubmit", "SubagentStart"]) {
    assert.equal(respond({ hook_event_name: name }).hookSpecificOutput.hookEventName, name);
  }
  for (const id of voiceIds) {
    const text = renderVoice(id, "PreToolUse");
    assert.ok(text.length < 1800);
    for (const part of ["Objective:", "Event:", "Authority:", "Exit:", "20–240"])
      assert.ok(text.includes(part));
  }
  assert.throws(() => renderVoice("absent", "startup"));
  assert.doesNotMatch(renderVoice("orientation", "<untrusted>"), /<untrusted>/);
});

test("malformed input fails closed; unrelated tools/events abstain", () => {
  for (const bad of ["not json", "null", "[]"]) {
    assert.equal(JSON.parse(invoke(bad).stdout).hookSpecificOutput.permissionDecision, "deny");
  }
  assert.equal(respond({ hook_event_name: "PreToolUse", tool_name: "apply_patch" }), null);
  assert.equal(respond({ hook_event_name: "Stop" }), null);
});

test("registration preserves authority; valid purpose cannot permit an owner merge", () => {
  const config = JSON.parse(readFileSync(new URL("../../../hooks.json", import.meta.url), "utf8"));
  assert.ok(
    config.hooks.PreToolUse.some((entry) =>
      entry.hooks.some((h) => h.command.includes("owner-authority-hook.mjs")),
    ),
  );
  assert.equal(config.hooks.Stop[0].hooks.length, 2);
  assert.equal(
    config.hooks.PreToolUse.find((entry) => entry.matcher === "Bash").hooks[0].timeout,
    5,
  );
  for (const name of ["SessionStart", "UserPromptSubmit", "SubagentStart"]) {
    assert.ok(config.hooks[name][0].hooks[0].command.includes("shell-purpose/hook.mjs"));
  }
  const merge = `# Purpose: Merge this pull request as part of the pending task.\ngh pr merge 1`;
  assert.equal(respond(event(merge)), null);
  const ownerHook = new URL("../../../../scripts/owner-authority-hook.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [ownerHook.pathname], {
    input: JSON.stringify(event(merge)),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});
