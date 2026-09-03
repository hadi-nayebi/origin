import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureTmuxCodex,
  sessionName,
} from "../../.codex/plugins/_dashboard-runtime/scripts/start-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("combined launcher and scripts expose the required interactive contract", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(manifest.scripts.origin, /start-harness\.mjs/);
  assert.doesNotMatch(JSON.stringify(manifest.scripts), /codex exec|ephemeral|headless/);
  assert.match(manifest.scripts.feedback, /contextual-feedback/);
  assert.match(manifest.scripts["agent-state"], /agent-stop-state/);
});

test("Stop hook is owned by Agent Stop State", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".codex", "hooks.json"), "utf8"));
  const hook = hooks.hooks.Stop[0].hooks[0];
  assert.match(hook.command, /agent-stop-state\/hooks\/stop\.mjs/);
  assert.doesNotMatch(hook.command, /contextual-feedback|feedback-loop/);
});

test("repository-scoped tmux session names are stable and separated", () => {
  assert.equal(sessionName(root), sessionName(root));
  assert.notEqual(sessionName(root), sessionName(`${root}-other`));
  assert.match(sessionName(root), /^origin-origin-[a-f0-9]{8}$/);
});

test("existing tmux sessions reuse Codex or launch it only from an idle shell", () => {
  const calls = [];
  const shellRun = (_command, args) => {
    calls.push(args);
    return { status: 0, stdout: args[0] === "list-panes" ? "bash\n" : "", stderr: "" };
  };
  assert.equal(ensureTmuxCodex(shellRun, "origin-test", ["codex", "resume", "--last"]), "started");
  assert.deepEqual(calls.at(-1), ["send-keys", "-t", "origin-test", "codex resume --last", "C-m"]);
  const codexRun = (_command, args) => ({
    status: 0,
    stdout: args[0] === "list-panes" ? "codex\n" : "",
    stderr: "",
  });
  assert.equal(ensureTmuxCodex(codexRun, "origin-test", ["codex"]), "running");
  assert.throws(
    () =>
      ensureTmuxCodex(
        (_command, args) => ({
          status: 0,
          stdout: args[0] === "list-panes" ? "python\n" : "",
          stderr: "",
        }),
        "origin-test",
        ["codex"],
      ),
    /does not contain exactly one Codex pane or one idle shell/,
  );
  assert.throws(
    () =>
      ensureTmuxCodex(
        (_command, args) => ({
          status: 0,
          stdout: args[0] === "list-panes" ? "bash\nzsh\n" : "",
          stderr: "",
        }),
        "origin-test",
        ["codex"],
      ),
    /does not contain exactly one Codex pane or one idle shell/,
  );
  assert.throws(
    () =>
      ensureTmuxCodex(
        (_command, args) => ({
          status: 0,
          stdout: args[0] === "list-panes" ? "codex\ncodex\n" : "",
          stderr: "",
        }),
        "origin-test",
        ["codex"],
      ),
    /more than one Codex pane/,
  );
});

test("installers require consent and Windows routes to WSL2", () => {
  const unix = fs.readFileSync(path.join(root, "scripts", "install.sh"), "utf8");
  const windows = fs.readFileSync(path.join(root, "scripts", "install.ps1"), "utf8");
  assert.match(unix, /Continue\? \[y\/N\]/);
  assert.match(unix, /npm install --global @openai\/codex/);
  assert.match(unix, /tmux/);
  assert.match(windows, /wsl --install/);
  assert.match(windows, /does not run.*native PowerShell/i);
});

test("README is agent-first and contains no headless fallback", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /Visiting agent: begin here/);
  assert.match(readme, /ONBOARDING_HANDOFF\.md/);
  assert.match(readme, /Hadosh Academy Base Dashboard/);
  assert.match(readme, /same interactive Codex session/i);
  assert.doesNotMatch(readme, /headless worker|dashboard still works without/i);
});

test("lockfile and package versions match", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
});
