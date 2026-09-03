import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  ensureAgentState,
  pauseAgent,
  readAgentState,
  resumeAgent,
  setAgentState,
  stopOutcome,
} from "../lib/state.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "origin-state-"));

test("initial state is explicit idle and active state blocks Stop", () => {
  const root = fixture();
  assert.equal(ensureAgentState(root, new Date("2026-09-03T12:00:00Z")).mode, "idle");
  const active = setAgentState(root, {
    mode: "active",
    reason: "Feedback remains.",
    nextAction: "Continue feedback.",
    reference: { plugin: "contextual-feedback", id: "feedback-001" },
  });
  assert.equal(active.revision, 1);
  assert.deepEqual(stopOutcome(root).reference, {
    plugin: "contextual-feedback",
    id: "feedback-001",
  });
  assert.equal(stopOutcome(root).block, true);
});

test("pause preserves the exact resume state and resists reconciliation", () => {
  const root = fixture();
  ensureAgentState(root);
  setAgentState(root, {
    mode: "active",
    reason: "Work remains.",
    nextAction: "Continue.",
    reference: { plugin: "contextual-feedback", id: "feedback-002" },
  });
  const paused = pauseAgent(root, "User requested a deliberate pause.");
  assert.equal(paused.mode, "paused");
  assert.equal(
    setAgentState(root, { mode: "idle", reason: "No work.", nextAction: null, reference: null })
      .mode,
    "paused",
  );
  assert.equal(resumeAgent(root).mode, "active");
});

test("revision mismatch and corrupt state fail closed", () => {
  const root = fixture();
  ensureAgentState(root);
  assert.throws(
    () =>
      setAgentState(
        root,
        { mode: "idle", reason: "Still idle.", nextAction: null, reference: null },
        { expectedRevision: 9 },
      ),
    /revision changed/,
  );
  fs.writeFileSync(path.join(root, ".origin", "agent-stop-state", "data.json"), "not-json");
  assert.throws(() => readAgentState(root), /corrupt/);
});

test("state rejects line-breaking voice inserts", () => {
  const root = fixture();
  assert.throws(
    () =>
      setAgentState(root, {
        mode: "active",
        reason: "first line\nsecond line",
        nextAction: "Continue.",
        reference: null,
      }),
    /State reason is invalid/,
  );
});

test("state rejects symbolic files instead of following them", (context) => {
  if (process.platform === "win32") return context.skip("Windows symlink creation is privileged.");
  const root = fixture();
  const directory = path.join(root, ".origin", "agent-stop-state");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(root, "outside.json");
  fs.writeFileSync(target, JSON.stringify({}));
  fs.symlinkSync(target, path.join(directory, "data.json"));
  assert.throws(() => readAgentState(root), /regular, non-symbolic/);
});

test("Stop hook blocks active and permits recorded waiting", () => {
  const root = fixture();
  ensureAgentState(root);
  setAgentState(root, {
    mode: "active",
    reason: "A request remains actionable.",
    nextAction: "Continue it.",
    reference: { plugin: "contextual-feedback", id: "feedback-003" },
  });
  const hook = path.join(pluginRoot, "hooks", "stop.mjs");
  const active = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop" }),
    encoding: "utf8",
    env: { ...process.env, ORIGIN_REPOSITORY_ROOT: root },
  });
  assert.equal(active.status, 2);
  assert.match(active.stderr, /Stopping is blocked/);
  setAgentState(root, {
    mode: "waiting",
    reason: "The user must answer.",
    nextAction: "Read the answer.",
    reference: { plugin: "contextual-feedback", id: "feedback-003" },
  });
  const waiting = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop" }),
    encoding: "utf8",
    env: { ...process.env, ORIGIN_REPOSITORY_ROOT: root },
  });
  assert.equal(waiting.status, 0);
  assert.equal(JSON.parse(waiting.stdout).continue, true);
});

test("Stop hook fails closed when state cannot be trusted", () => {
  const root = fixture();
  const hook = path.join(pluginRoot, "hooks", "stop.mjs");
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop" }),
    encoding: "utf8",
    env: { ...process.env, ORIGIN_REPOSITORY_ROOT: root },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot be trusted/);
});

test("every public mode matches the tracked state schema", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(pluginRoot, "data.schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const root = fixture();
  ensureAgentState(root);
  for (const mode of ["active", "waiting", "idle"]) {
    const state = setAgentState(root, {
      mode,
      reason: `${mode} state is under schema test.`,
      nextAction: mode === "idle" ? null : "Continue the schema test.",
      reference: mode === "idle" ? null : { plugin: "contextual-feedback", id: `feedback-${mode}` },
    });
    assert.equal(validate(state), true, JSON.stringify(validate.errors));
  }
  assert.equal(
    validate(pauseAgent(root, "Pause for the schema test.")),
    true,
    JSON.stringify(validate.errors),
  );
});
