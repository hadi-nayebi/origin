import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createFeedback, listFeedback, nextFeedback, stopOutcome, transitionFeedback } from "../lib/feedback-store.mjs";

function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), "origin-feedback-")); }

test("new feedback is durable, page-aware, and keeps the agent active", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "feature", body: "Create a project page", pagePath: "/", pageLabel: "Origin canvas" }, new Date("2026-09-02T12:00:00Z"));
  assert.equal(listFeedback(root)[0].pagePath, "/");
  assert.equal(nextFeedback(root).id, record.id);
  assert.deepEqual(stopOutcome(root), { mode: "active", block: true, reference: record.id, message: `Actionable feedback remains. Continue record ${record.id} through the public feedback command.` });
});

test("in-progress feedback stays focused before older open feedback", () => {
  const root = fixture();
  const first = createFeedback(root, { kind: "update", body: "First open request", pagePath: "/", pageLabel: "Canvas" }, new Date("2026-09-02T12:00:00Z"));
  const second = createFeedback(root, { kind: "bug", body: "Second open request", pagePath: "/wiki", pageLabel: "Wiki" }, new Date("2026-09-02T12:01:00Z"));
  transitionFeedback(root, second.id, "in_progress", {}, new Date("2026-09-02T12:02:00Z"));
  assert.equal(nextFeedback(root).id, second.id);
  assert.equal(listFeedback(root).find((item) => item.id === first.id).status, "open");
});

test("waiting permits Stop only when no other actionable record remains", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "update", body: "Choose the desired name", pagePath: "/", pageLabel: "Canvas" });
  transitionFeedback(root, record.id, "waiting", { waitReason: "The user must choose between two consequential names." });
  assert.equal(stopOutcome(root).mode, "waiting");
  assert.equal(stopOutcome(root).block, false);
});

test("resolution requires evidence and produces idle only after all work closes", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "bug", body: "Fix the broken control", pagePath: "/", pageLabel: "Canvas" });
  transitionFeedback(root, record.id, "in_progress");
  assert.throws(() => transitionFeedback(root, record.id, "resolved", { resolution: "fixed" }), /Resolution evidence/);
  transitionFeedback(root, record.id, "resolved", { resolution: "Repaired the control and verified it through the browser test." });
  assert.equal(stopOutcome(root).mode, "idle");
});

test("corrupt ledger fails closed", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  fs.writeFileSync(path.join(root, ".origin", "feedback.jsonl"), "not-json\n");
  assert.throws(() => stopOutcome(root), /corrupt/);
});

test("Stop hook ignores unrelated events without reading feedback state", () => {
  const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
  const unrelated = spawnSync(process.execPath, [path.join(repositoryRoot, ".codex/plugins/feedback-loop/hooks/stop.mjs")], { input: JSON.stringify({ hook_event_name: "PostToolUse" }), encoding: "utf8" });
  assert.equal(unrelated.status, 0);
  assert.equal(unrelated.stdout, "");
  assert.equal(unrelated.stderr, "");
});
