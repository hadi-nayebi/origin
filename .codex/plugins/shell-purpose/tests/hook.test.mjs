import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after } from "node:test";
import { classifyCommand, commandText, evaluate, respond, validPurpose } from "../hook.mjs";
import { renderVoice, voiceIds } from "../voices.mjs";
const hook = fileURLToPath(new URL("../hook.mjs", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "origin-shell-purpose-"));
const state = join(temporary, "data.json");
after(() => rmSync(temporary, { recursive: true, force: true }));
const purpose = "Inspect the working tree before making edits.";
const command = `# Purpose: ${purpose}\ngit status --short`;
const event = (value) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: value },
});
const invoke = (input, stateFile = state) =>
  spawnSync(process.execPath, [hook], {
    input,
    encoding: "utf8",
    env: { ...process.env, ORIGIN_SHELL_PURPOSE_STATE: stateFile },
  });

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

test("command families distinguish cd, plugin locations, chains and pipelines", () => {
  assert.deepEqual(classifyCommand(`# Purpose: ${purpose}\ncd -- 'path with spaces'`), {
    overall: "cd",
    shape: "cd:cd",
    operators: [],
    segments: [{ family: "cd", executable: "cd", target: "path with spaces" }],
    valid: true,
  });
  const mixed = classifyCommand(
    `# Purpose: ${purpose}\ncd repo && node .codex/plugins/shell-purpose/hook.mjs | sed 's/a|b/c/'`,
  );
  assert.equal(mixed.overall, "pipeline");
  assert.deepEqual(mixed.operators, ["&&", "|"]);
  assert.deepEqual(
    mixed.segments.map(({ family }) => family),
    ["cd", "plugin-location", "command"],
  );
  assert.equal(classifyCommand(`# Purpose: ${purpose}\nprintf 'unterminated`).valid, false);
  assert.equal(classifyCommand(`# Purpose: ${purpose}\ncd`).valid, false);
  assert.equal(
    classifyCommand(`# Purpose: ${purpose}\ncd "C:\\Users\\Hadi Nayebi\\Origin"`).segments[0]
      .target,
    "C:\\Users\\Hadi Nayebi\\Origin",
  );
});

test("reviewed policy can remove purpose friction without weakening shape checks", () => {
  const emptyPolicy = {
    purposeOptionalShapes: [],
    purposeOptionalExecutables: [],
  };
  const missing = evaluate(event("cd repo"), emptyPolicy);
  assert.equal(missing.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(missing.transaction.reason, "missing-purpose");

  const cdOptional = {
    purposeOptionalShapes: ["cd:cd"],
    purposeOptionalExecutables: [],
  };
  const allowedCd = evaluate(event("cd repo"), cdOptional);
  assert.equal(allowedCd.output, null);
  assert.equal(allowedCd.transaction.purpose, null);
  assert.equal(allowedCd.transaction.reason, "valid-purpose-optional");

  const malformed = evaluate(event("# Purpose: short\ncd repo"), cdOptional);
  assert.equal(malformed.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(malformed.transaction.reason, "invalid-purpose");

  const gitOptional = {
    purposeOptionalShapes: [],
    purposeOptionalExecutables: ["git"],
  };
  assert.equal(evaluate(event("git status --short"), gitOptional).output, null);
  assert.equal(
    evaluate(event("git status --short && printf done"), gitOptional).output.hookSpecificOutput
      .permissionDecision,
    "deny",
  );
  assert.equal(
    evaluate(event("printf 'unterminated"), {
      purposeOptionalShapes: ["command:command"],
      purposeOptionalExecutables: [],
    }).output.hookSpecificOutput.permissionDecision,
    "deny",
  );
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

test("every Bash validation records bounded evidence without storing the command text", () => {
  const stateFile = join(temporary, "evidence.json");
  assert.equal(invoke(JSON.stringify(event(command)), stateFile).stdout, "");
  const data = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(data.version, 1);
  assert.equal(data.sequence, 1);
  assert.equal(data.transactions[0].purpose, purpose);
  assert.equal(data.transactions[0].purposeTruncated, false);
  assert.equal(data.transactions[0].classification.shape, "command:command");
  assert.match(data.transactions[0].commandDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(data), /git status --short/);
  assert.equal(data.candidates.executables.git.observations, 1);
});

test("invalid oversized comments and command graphs remain bounded", () => {
  const stateFile = join(temporary, "bounded.json");
  const oversized = `# Purpose: ${"x".repeat(20_000)}\n${Array.from({ length: 40 }, () => "true").join(" && ")}`;
  const output = JSON.parse(invoke(JSON.stringify(event(oversized)), stateFile).stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  const data = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal([...data.transactions[0].purpose].length, 240);
  assert.equal(data.transactions[0].purposeTruncated, true);
  assert.equal(data.transactions[0].classification.segments.length, 32);
  assert.equal(data.transactions[0].classification.valid, false);
  assert.ok(readFileSync(stateFile).byteLength < 20_000);
});

test("corrupt or legacy state fails closed instead of discarding history", () => {
  for (const content of ["{", '{"version":0,"transactions":[]}']) {
    const stateFile = join(temporary, `corrupt-${Buffer.from(content).toString("hex")}.json`);
    writeFileSync(stateFile, content);
    const output = JSON.parse(invoke(JSON.stringify(event(command)), stateFile).stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /could not be safely read/);
    assert.equal(readFileSync(stateFile, "utf8"), content);
  }
});

test("symbolic state files and ancestors fail closed without touching their targets", () => {
  const outside = join(temporary, "outside.json");
  const valid = JSON.stringify({ version: 1, sequence: 0, transactions: [], candidates: {} });
  writeFileSync(outside, valid);
  const linkedFile = join(temporary, "linked-state.json");
  symlinkSync(outside, linkedFile);
  const linkedOutput = JSON.parse(invoke(JSON.stringify(event(command)), linkedFile).stdout);
  assert.equal(linkedOutput.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(readFileSync(outside, "utf8"), valid);

  const linkedDirectory = join(temporary, "linked-directory");
  writeFileSync(outside, valid);
  symlinkSync(temporary, linkedDirectory, "dir");
  const ancestorOutput = JSON.parse(
    invoke(JSON.stringify(event(command)), join(linkedDirectory, "outside.json")).stdout,
  );
  assert.equal(ancestorOutput.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(readFileSync(outside, "utf8"), valid);
});

test("concurrent hook processes serialize all transaction records", async () => {
  const stateFile = join(temporary, "concurrent.json");
  const run = (index) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [hook], {
        env: { ...process.env, ORIGIN_SHELL_PURPOSE_STATE: stateFile },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      let error = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (error += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 && output === "" && error === ""
          ? resolve()
          : reject(new Error(`child ${index}: ${code} ${output} ${error}`)),
      );
      child.stdin.end(JSON.stringify(event(`# Purpose: ${purpose} ${index}\nprintf '${index}'`)));
    });
  await Promise.all(Array.from({ length: 16 }, (_, index) => run(index)));
  const data = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(data.sequence, 16);
  assert.equal(data.transactions.length, 16);
  assert.equal(new Set(data.transactions.map(({ id }) => id)).size, 16);
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
  const merge = "gh pr merge 1";
  assert.equal(
    evaluate(event(merge), {
      purposeOptionalShapes: [],
      purposeOptionalExecutables: ["gh"],
    }).output,
    null,
  );
  const ownerHook = fileURLToPath(
    new URL("../../../../scripts/owner-authority-hook.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [ownerHook], {
    input: JSON.stringify(event(merge)),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});
