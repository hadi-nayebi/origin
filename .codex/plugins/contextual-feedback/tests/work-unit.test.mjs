import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createFeedback,
  getFeedback,
  linkFeedbackWork,
  recordVersion,
  transitionFeedback,
} from "../../_engagement-core/lib/service.mjs";
import {
  inspectPullRequest,
  linkPullRequest,
  mergePullRequest,
  normalizePullRequestUrl,
  prepareWorktree,
  requirePullRequestReference,
} from "../../_engagement-core/lib/pull-request.mjs";

function fixture(t) {
  const base = path.resolve(".origin/work-unit-fixtures");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "work-unit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function request(root) {
  return createFeedback(root, {
    kind: "feature",
    body: "Add the requested page control",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
}

function githubRunner(options = {}) {
  let merged = Boolean(options.merged);
  const headRefName = options.headRefName || "origin/contextual-feedback/aaaaaaaaaaaa";
  const calls = [];
  return {
    calls,
    run(binary, args) {
      calls.push([binary, ...args]);
      if (binary === "git")
        return { status: 0, stdout: "git@github.com:example/origin.git\n", stderr: "" };
      if (args[0] === "pr" && args[1] === "view")
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 42,
            url: "https://github.com/example/origin/pull/42",
            state: merged ? "MERGED" : options.state || "OPEN",
            isDraft: Boolean(options.isDraft),
            headRefName,
            baseRefName: "main",
            mergeable: options.mergeable || "MERGEABLE",
            mergedAt: merged ? "2026-09-12T20:00:00Z" : null,
          }),
          stderr: "",
        };
      if (args[0] === "pr" && args[1] === "merge") {
        if (options.mergeSucceeds !== false) merged = true;
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "unexpected" };
    },
  };
}

test("pull request references are canonical and repository-bound", (t) => {
  const root = fixture(t);
  const github = githubRunner();
  assert.equal(
    normalizePullRequestUrl("https://github.com/example/origin/pull/42/"),
    "https://github.com/example/origin/pull/42",
  );
  assert.equal(
    inspectPullRequest(root, "https://github.com/example/origin/pull/42", github).number,
    42,
  );
  assert.throws(
    () => inspectPullRequest(root, "https://github.com/other/origin/pull/42", github),
    /this Origin repository/,
  );
  assert.throws(() => normalizePullRequestUrl("https://example.com/pr/42"), /full public GitHub/);
});

test("owner merge resolves a work unit only after GitHub confirms the linked PR", (t) => {
  const root = fixture(t);
  const github = githubRunner();
  const item = request(root);
  linkFeedbackWork(root, item.id, "worktree:origin/contextual-feedback/aaaaaaaaaaaa");
  linkPullRequest(root, item.id, "https://github.com/example/origin/pull/42", github);
  transitionFeedback(root, item.id, "in_progress");
  transitionFeedback(root, item.id, "ready_for_review", {
    verification: "Verified the requested control with focused regression and browser checks.",
  });
  const expectedVersion = recordVersion(getFeedback(root, item.id));
  const result = mergePullRequest(root, root, item.id, expectedVersion, github);
  assert.equal(result.record.status, "resolved");
  assert.match(result.record.acceptance, /merged PR #42/);
  assert.equal(github.calls.filter((call) => call[0] === "gh" && call[2] === "merge").length, 1);
});

test("linking requires this work unit's exact managed branch and an open PR", (t) => {
  const root = fixture(t);
  const item = request(root);
  assert.throws(
    () =>
      linkPullRequest(root, item.id, "https://github.com/example/origin/pull/42", githubRunner()),
    /managed worktree branch/,
  );
  linkFeedbackWork(root, item.id, "worktree:origin/contextual-feedback/aaaaaaaaaaaa");
  assert.throws(
    () =>
      linkPullRequest(
        root,
        item.id,
        "https://github.com/example/origin/pull/42",
        githubRunner({ headRefName: "unrelated-branch" }),
      ),
    /head must match/,
  );
});

test("drafts, conflicts and unconfirmed merges remain unresolved", (t) => {
  for (const [name, options, message] of [
    ["draft", { isDraft: true }, /ready for review/],
    ["conflict", { mergeable: "CONFLICTING" }, /merge conflicts/],
    ["unconfirmed", { mergeSucceeds: false }, /did not confirm/],
  ]) {
    const root = fixture(t);
    const github = githubRunner(options);
    const item = request(root);
    linkFeedbackWork(root, item.id, "worktree:origin/contextual-feedback/aaaaaaaaaaaa");
    linkPullRequest(root, item.id, "https://github.com/example/origin/pull/42", github);
    transitionFeedback(root, item.id, "in_progress");
    transitionFeedback(root, item.id, "ready_for_review", {
      verification: `Verified fixture for ${name}.`,
    });
    const version = recordVersion(getFeedback(root, item.id));
    assert.throws(() => mergePullRequest(root, root, item.id, version, github), message);
    assert.equal(getFeedback(root, item.id).status, "ready_for_review");
  }
});

test("retry observes an already merged remote PR without merging twice", (t) => {
  const root = fixture(t);
  const github = githubRunner({ merged: true });
  const item = request(root);
  linkFeedbackWork(root, item.id, "worktree:origin/contextual-feedback/aaaaaaaaaaaa");
  linkFeedbackWork(root, item.id, "pull-request:https://github.com/example/origin/pull/42");
  transitionFeedback(root, item.id, "in_progress");
  transitionFeedback(root, item.id, "ready_for_review", {
    verification: "Verified before the owner merge response was interrupted.",
  });
  const version = recordVersion(getFeedback(root, item.id));
  const result = mergePullRequest(root, root, item.id, version, github);
  assert.equal(result.record.status, "resolved");
  assert.equal(
    github.calls.some((call) => call[0] === "gh" && call[2] === "merge"),
    false,
  );
});

test("merge requires current review state and exactly one linked PR", (t) => {
  const root = fixture(t);
  const github = githubRunner();
  const item = request(root);
  assert.throws(() => requirePullRequestReference(item), /Exactly one/);
  linkFeedbackWork(root, item.id, "pull-request:https://github.com/example/origin/pull/41");
  linkFeedbackWork(root, item.id, "pull-request:https://github.com/example/origin/pull/42");
  const current = getFeedback(root, item.id);
  assert.throws(() => requirePullRequestReference(current), /Exactly one/);
  assert.throws(
    () => mergePullRequest(root, root, item.id, recordVersion(current), github),
    /ready for review/,
  );
});

test("a work unit gets a deterministic private worktree and feature branch", (t) => {
  const root = fixture(t);
  const item = request(root);
  const calls = [];
  const result = prepareWorktree(root, item.id, {
    run(binary, args) {
      calls.push([binary, ...args]);
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.match(result.branch, /^origin\/contextual-feedback\/[a-f0-9]{12}$/);
  assert.equal(result.path.startsWith(path.join(root, ".origin", "worktrees")), true);
  assert.deepEqual(calls[0].slice(0, 4), ["git", "worktree", "add", "-b"]);
  assert.equal(getFeedback(root, item.id).linkedWork.includes(`worktree:${result.branch}`), true);
});

test("the managed worktree is created by real Git and is safe to resume", (t) => {
  const root = fixture(t);
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git("init", "-b", "main").status, 0);
  assert.equal(git("config", "user.name", "Origin Test").status, 0);
  assert.equal(git("config", "user.email", "origin@example.invalid").status, 0);
  fs.writeFileSync(path.join(root, "README.md"), "# Disposable Origin fixture\n");
  assert.equal(git("add", "README.md").status, 0);
  assert.equal(git("commit", "-m", "fixture").status, 0);
  const item = request(root);
  const first = prepareWorktree(root, item.id);
  const second = prepareWorktree(root, item.id);
  assert.equal(second.path, first.path);
  assert.equal(second.branch, first.branch);
  assert.equal(fs.existsSync(path.join(first.path, ".git")), true);
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd: first.path,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(branch.status, 0);
  assert.equal(branch.stdout.trim(), first.branch);
});
