import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createFeedback, listFeedback, nextFeedback, stopOutcome, transitionFeedback } from "../lib/service.mjs";
import { renderVoice } from "../lib/voice.mjs";

function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), "origin-feedback-")); }

test("new feedback is durable, page-aware, and keeps the agent active", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "feature", body: "Create a project page", pagePath: "/", pageLabel: "Origin canvas" }, new Date("2026-09-02T12:00:00Z"));
  assert.equal(listFeedback(root)[0].pagePath, "/");
  assert.equal(nextFeedback(root).id, record.id);
  assert.deepEqual(stopOutcome(root), { mode: "active", block: true, reference: record.id, voiceId: "stop.active" });
});

test("in-progress feedback stays focused before older open feedback", () => {
  const root = fixture();
  const first = createFeedback(root, { kind: "update", body: "First open request", pagePath: "/", pageLabel: "Canvas" }, new Date("2026-09-02T12:00:00Z"));
  const second = createFeedback(root, { kind: "bug", body: "Second open request", pagePath: "/wiki", pageLabel: "Wiki" }, new Date("2026-09-02T12:01:00Z"));
  transitionFeedback(root, second.id, "in_progress", {}, new Date("2026-09-02T12:02:00Z"));
  assert.equal(nextFeedback(root).id, second.id);
  assert.equal(listFeedback(root).find((item) => item.id === first.id).status, "open");
});

test("only one feedback record may be in progress", () => {
  const root = fixture();
  const first = createFeedback(root, { kind: "update", body: "First request", pagePath: "/", pageLabel: "Canvas" });
  const second = createFeedback(root, { kind: "update", body: "Second request", pagePath: "/", pageLabel: "Canvas" });
  transitionFeedback(root, first.id, "in_progress");
  assert.throws(() => transitionFeedback(root, second.id, "in_progress"), /Only one feedback record/);
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

test("dismissal requires a reason and reopening clears terminal metadata", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "feature", body: "Add an optional panel", pagePath: "/", pageLabel: "Canvas" });
  assert.throws(() => transitionFeedback(root, record.id, "dismissed"), /Dismissal reason/);
  transitionFeedback(root, record.id, "dismissed", { reason: "The user explicitly withdrew this request." });
  const reopened = transitionFeedback(root, record.id, "open", { reason: "The user requested it again." });
  assert.equal(reopened.dismissalReason, undefined);
  assert.equal(reopened.reopenReason, "The user requested it again.");
});

test("corrupt ledger fails closed", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  fs.writeFileSync(path.join(root, ".origin", "feedback.jsonl"), "not-json\n");
  assert.throws(() => stopOutcome(root), /corrupt/);
});

test("illegal transitions in persisted history fail closed", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "bug", body: "Repair the page control", pagePath: "/", pageLabel: "Canvas" });
  const file = path.join(root, ".origin", "feedback.jsonl");
  fs.appendFileSync(file, `${JSON.stringify({ schemaVersion: 1, type: "feedback.status-changed", id: record.id, status: "resolved", at: new Date().toISOString(), resolution: "Claims resolution without entering focused work." })}\n`);
  assert.throws(() => listFeedback(root), /Invalid feedback transition/);
});

test("chronologically invalid persisted history fails closed", () => {
  const root = fixture();
  const record = createFeedback(root, { kind: "bug", body: "Repair the page control", pagePath: "/", pageLabel: "Canvas" }, new Date("2026-09-02T12:00:00Z"));
  const file = path.join(root, ".origin", "feedback.jsonl");
  fs.appendFileSync(file, `${JSON.stringify({ schemaVersion: 1, type: "feedback.status-changed", id: record.id, status: "in_progress", at: "2026-09-02T11:59:59.000Z" })}\n`);
  assert.throws(() => listFeedback(root), /timestamp moves backward/);
});

test("voice catalog renders bounded Stop guidance", () => {
  const voicePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../voice.xml");
  const output = renderVoice(voicePath, "stop.active", { reference: "123-record" });
  assert.match(output, /123-record/);
  assert.match(output, /Stopping is blocked/);
});

test("Stop hook ignores unrelated events without reading feedback state", () => {
  const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
  const unrelated = spawnSync(process.execPath, [path.join(repositoryRoot, ".codex/plugins/feedback-loop/hooks/stop.mjs")], { input: JSON.stringify({ hook_event_name: "PostToolUse" }), encoding: "utf8" });
  assert.equal(unrelated.status, 0);
  assert.equal(unrelated.stdout, "");
  assert.equal(unrelated.stderr, "");
});
