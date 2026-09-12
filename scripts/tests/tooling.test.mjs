import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ensureTmuxCodex,
  sessionName,
} from "../../.codex/plugins/_dashboard-runtime/scripts/start-harness.mjs";
import { inspectGitHubRepositoryAccess } from "../github-repository-access.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("combined launcher and scripts expose the required interactive contract", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(manifest.scripts.origin, /start-harness\.mjs/);
  assert.doesNotMatch(JSON.stringify(manifest.scripts), /codex exec|ephemeral|headless/);
  assert.match(manifest.scripts.feedback, /contextual-feedback/);
  assert.match(manifest.scripts["agent-state"], /agent-stop-state/);
});

test("Stop hooks independently dispatch both removable channels", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".codex", "hooks.json"), "utf8"));
  const commands = hooks.hooks.Stop.flatMap((group) => group.hooks.map((h) => h.command));
  assert.equal(commands.length, 2);
  assert.match(commands[0], /channel-hook.mjs.*contextual-feedback/);
  assert.match(commands[1], /channel-hook.mjs.*telegram-engagement/);
});

test("PreToolUse deterministically blocks agent merge paths and protects its control files", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, ".codex", "hooks.json"), "utf8"));
  assert.equal(hooks.hooks.PreToolUse[0].matcher, "*");
  assert.match(hooks.hooks.PreToolUse[0].hooks[0].command, /owner-authority-hook\.mjs/);
  const inspect = (tool_name, tool_input) => {
    const run = spawnSync(process.execPath, [path.join(root, "scripts/owner-authority-hook.mjs")], {
      input: JSON.stringify({ tool_name, tool_input }),
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout ? JSON.parse(run.stdout) : null;
  };
  assert.equal(inspect("Bash", { command: "gh pr create --fill" }), null);
  assert.equal(inspect("Bash", { command: "git push origin feature/useful-page" }), null);
  assert.equal(
    inspect("Bash", { command: "gh pr merge 42 --merge" }).hookSpecificOutput.permissionDecision,
    "deny",
  );
  assert.equal(
    inspect("Bash", { command: "git push origin HEAD:main" }).hookSpecificOutput.permissionDecision,
    "deny",
  );
  {
    const blocked = inspect("mcp__codex_apps__github_merge_pull_request", {
      repository_full_name: "owner/repo",
      pr_number: 42,
    });
    assert.equal(blocked.hookSpecificOutput.permissionDecision, "deny");
  }
  assert.equal(
    inspect("apply_patch", { patch: "*** Update File: .codex/hooks.json" }).hookSpecificOutput
      .permissionDecision,
    "deny",
  );
  assert.equal(
    inspect("apply_patch", "*** Update File: scripts/owner-authority-hook.mjs").hookSpecificOutput
      .permissionDecision,
    "deny",
  );
  assert.equal(
    inspect("Bash", {
      command: `node -e 'reviewFeedbackMutation(root, id, "resolved")'`,
    }).hookSpecificOutput.permissionDecision,
    "deny",
  );
});

test("repository-scoped tmux session names are stable and separated", () => {
  assert.equal(sessionName(root), sessionName(root));
  assert.notEqual(sessionName(root), sessionName(`${root}-other`));
  const repositorySlug = path
    .basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  assert.match(sessionName(root), new RegExp(`^origin-${repositorySlug}-[a-f0-9]{8}$`));
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
  assert.match(unix, /gh auth login/);
  assert.match(unix, /tmux/);
  assert.match(windows, /wsl --install/);
  assert.match(windows, /does not run.*native PowerShell/i);
  assert.match(windows, /repository from the Origin template/i);
});

test("doctor requires a user-writable GitHub repository", () => {
  const inspect = (payload, status = 0) =>
    inspectGitHubRepositoryAccess({
      cwd: root,
      run: () => ({
        status,
        stdout: status === 0 ? JSON.stringify(payload) : "",
        stderr: "denied",
      }),
    });
  assert.equal(inspect({ nameWithOwner: "person/harness", viewerPermission: "ADMIN" }).ok, true);
  assert.equal(inspect({ nameWithOwner: "team/harness", viewerPermission: "WRITE" }).ok, true);
  const readOnly = inspect({ nameWithOwner: "hadi-nayebi/origin", viewerPermission: "READ" });
  assert.equal(readOnly.ok, false);
  assert.match(readOnly.detail, /Origin template/);
  assert.equal(inspect({}, 1).ok, false);
});

test("README is agent-first and contains no headless fallback", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /Visiting agent: begin here/);
  assert.match(readme, /ONBOARDING_HANDOFF\.md/);
  assert.match(readme, /Hadosh Academy Origin project/);
  assert.match(readme, /same interactive Codex session/i);
  assert.match(readme, /Use this template/);
  assert.match(readme, /main.*branch ruleset/);
  assert.doesNotMatch(readme, /git clone https:\/\/github\.com\/hadi-nayebi\/origin\.git/);
  assert.doesNotMatch(readme, /headless worker|dashboard still works without/i);
});

test("plugin voices provide objective-driven orientation rather than vague notices", () => {
  const feedbackVoice = fs.readFileSync(
    path.join(root, ".codex", "plugins", "contextual-feedback", "voice.xml"),
    "utf8",
  );
  const feedbackBodies = [
    ...feedbackVoice.matchAll(/<voice id="(feedback\.[^"]+)">\s*<body>([\s\S]*?)<\/body>/g),
  ];
  assert.deepEqual(feedbackBodies.map((match) => match[1]).sort(), [
    "feedback.accepted",
    "feedback.answer",
    "feedback.dismissed",
    "feedback.during-active",
    "feedback.new",
    "feedback.reopened",
    "feedback.resume",
  ]);
  for (const [, id, body] of feedbackBodies) {
    assert.match(body, /Why this voice fired:/, id);
    assert.match(body, /Orient to the work:/, id);
    assert.match(body, /Next boundary:/, id);
    assert.match(body, /\{\{wakeMarker\}\}/, id);
  }
  const stopVoice = fs.readFileSync(
    path.join(root, ".codex", "plugins", "agent-stop-state", "voice.xml"),
    "utf8",
  );
  for (const match of stopVoice.matchAll(/<voice id="([^"]+)">\s*<body>([\s\S]*?)<\/body>/g))
    assert.match(match[2], /Why (?:this gate fired|stopping is allowed)/, match[1]);
});

test("agent instructions distinguish internal voice coaching from hard enforcement", () => {
  const files = [
    "AGENTS.md",
    ".codex/AGENTS.md",
    ".codex/plugins/AGENTS.md",
    ".codex/plugins/contextual-feedback/AGENTS.md",
    ".codex/plugins/agent-stop-state/AGENTS.md",
  ];
  const combined = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.match(combined, /event-triggered reorientation/i);
  assert.match(combined, /language of the work/i);
  assert.match(combined, /probabilistic coaching/i);
  assert.match(combined, /(?:hard|deterministic) (?:invariants|boundary|edge|enforcement|hook)/i);
  assert.match(combined, /plugin objective/i);
});

test("lockfile and package versions match", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
});
