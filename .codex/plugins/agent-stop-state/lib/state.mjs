import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MODES = new Set(["idle", "active", "waiting", "paused"]);
const waitArray = new Int32Array(new SharedArrayBuffer(4));

export function initialAgentState(now = new Date()) {
  return Object.freeze({
    schemaVersion: 1,
    mode: "idle",
    reason: "Origin has no runnable responsibility.",
    nextAction: null,
    reference: null,
    resumeState: null,
    revision: 0,
    updatedAt: now.toISOString(),
  });
}

export function ensureAgentState(root, now = new Date()) {
  return withStateLock(root, () => {
    const file = statePath(root);
    if (!fs.existsSync(file)) writeState(root, initialAgentState(now));
    return readAgentState(root);
  });
}

export function readAgentState(root) {
  const file = statePath(root);
  if (!fs.existsSync(file)) throw new Error("Agent state is missing. Run `npm run origin`.");
  const metadata = fs.lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("Agent state must be a regular, non-symbolic file.");
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error("Agent state is corrupt.");
  }
  return validateState(value);
}

export function setAgentState(root, input, options = {}, now = new Date()) {
  return withStateLock(root, () => {
    if (!fs.existsSync(statePath(root))) writeState(root, initialAgentState(now));
    const current = readAgentState(root);
    if (
      options.expectedRevision !== undefined &&
      current.revision !== Number(options.expectedRevision)
    )
      throw new Error("Agent state revision changed; reconcile again.");
    if (current.mode === "paused" && !options.overridePause) return current;
    const next = validateState({
      schemaVersion: 1,
      mode: boundedMode(input.mode),
      reason: bounded(input.reason, "State reason", 1, 500),
      nextAction: nullableBounded(input.nextAction, "Next action", 500),
      reference: normalizeReference(input.reference),
      resumeState: null,
      revision: current.revision + 1,
      updatedAt: now.toISOString(),
    });
    writeState(root, next);
    return next;
  });
}

export function pauseAgent(root, reason, now = new Date()) {
  return withStateLock(root, () => {
    if (!fs.existsSync(statePath(root))) writeState(root, initialAgentState(now));
    const current = readAgentState(root);
    if (current.mode === "paused") return current;
    const next = validateState({
      schemaVersion: 1,
      mode: "paused",
      reason: bounded(reason, "Pause reason", 3, 500),
      nextAction: "Resume only after the user explicitly requests it.",
      reference: current.reference,
      resumeState: {
        mode: current.mode,
        reason: current.reason,
        nextAction: current.nextAction,
        reference: current.reference,
      },
      revision: current.revision + 1,
      updatedAt: now.toISOString(),
    });
    writeState(root, next);
    return next;
  });
}

export function resumeAgent(root, now = new Date()) {
  return withStateLock(root, () => {
    const current = readAgentState(root);
    if (current.mode !== "paused") throw new Error("Agent state is not paused.");
    const resume = current.resumeState || initialAgentState(now);
    const next = validateState({
      schemaVersion: 1,
      mode: resume.mode,
      reason: resume.reason,
      nextAction: resume.nextAction,
      reference: resume.reference,
      resumeState: null,
      revision: current.revision + 1,
      updatedAt: now.toISOString(),
    });
    writeState(root, next);
    return next;
  });
}

export function stopOutcome(root) {
  const state = readAgentState(root);
  return Object.freeze({
    mode: state.mode,
    block: state.mode === "active",
    reference: state.reference,
    voiceId: `stop.${state.mode}`,
    reason: state.reason,
    nextAction: state.nextAction,
    revision: state.revision,
  });
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Agent state is invalid.");
  const expected = [
    "schemaVersion",
    "mode",
    "reason",
    "nextAction",
    "reference",
    "resumeState",
    "revision",
    "updatedAt",
  ].sort();
  if (Object.keys(value).sort().join("|") !== expected.join("|"))
    throw new Error("Agent state shape is invalid.");
  if (value.schemaVersion !== 1) throw new Error("Agent state version is unsupported.");
  boundedMode(value.mode);
  bounded(value.reason, "State reason", 1, 500);
  nullableBounded(value.nextAction, "Next action", 500);
  normalizeReference(value.reference);
  if (!Number.isInteger(value.revision) || value.revision < 0)
    throw new Error("Agent state revision is invalid.");
  if (!validTimestamp(value.updatedAt)) throw new Error("Agent state timestamp is invalid.");
  if (value.mode === "paused") {
    if (!value.resumeState || value.resumeState.mode === "paused")
      throw new Error("Paused state requires a non-paused resume state.");
    boundedMode(value.resumeState.mode);
    bounded(value.resumeState.reason, "Resume reason", 1, 500);
    nullableBounded(value.resumeState.nextAction, "Resume action", 500);
    normalizeReference(value.resumeState.reference);
  } else if (value.resumeState !== null) {
    throw new Error("Only paused state may retain resume state.");
  }
  return Object.freeze(structuredClone(value));
}

function writeState(root, state) {
  const directory = path.dirname(statePath(root));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `state-${process.pid}-${crypto.randomUUID()}.next`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, statePath(root));
}

function withStateLock(root, operation) {
  const directory = path.dirname(statePath(root));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "data.json.lock");
  const token = crypto.randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          token,
          pid: process.pid,
          host: os.hostname(),
          createdAt: new Date().toISOString(),
        }),
      );
      fs.fsyncSync(descriptor);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearDeadStateLock(file);
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  if (descriptor === undefined) throw new Error("Agent state is busy.");
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      if (JSON.parse(fs.readFileSync(file, "utf8")).token === token) fs.unlinkSync(file);
    } catch {}
  }
}

function clearDeadStateLock(file) {
  try {
    const owner = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - Date.parse(owner.createdAt) > 30_000) return fs.unlinkSync(file);
    if (owner.host !== os.hostname() || !Number.isInteger(owner.pid)) return;
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") fs.unlinkSync(file);
    }
  } catch {}
}

function boundedMode(value) {
  if (!MODES.has(value)) throw new Error("Unknown agent state mode.");
  return value;
}
function bounded(value, label, minimum, maximum) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const clean = value.trim();
  if (
    clean.length < minimum ||
    clean.length > maximum ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(clean)
  )
    throw new Error(`${label} is invalid.`);
  return clean;
}
function nullableBounded(value, label, maximum) {
  return value == null ? null : bounded(value, label, 1, maximum);
}
function normalizeReference(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("State reference is invalid.");
  const plugin = bounded(value.plugin, "Reference plugin", 2, 64);
  const id = bounded(value.id, "Reference ID", 3, 128);
  if (!/^[a-z0-9-]+$/.test(plugin) || !/^[A-Za-z0-9-]+$/.test(id))
    throw new Error("State reference is invalid.");
  return Object.freeze({ plugin, id });
}
function validTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function statePath(root) {
  return path.join(path.resolve(root), ".origin", "agent-stop-state", "data.json");
}
