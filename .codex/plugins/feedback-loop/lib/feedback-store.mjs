import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const STATUSES = new Set(["open", "in_progress", "waiting", "resolved", "dismissed"]);
const KINDS = new Set(["update", "feature", "bug"]);
const waitArray = new Int32Array(new SharedArrayBuffer(4));

export function listFeedback(repositoryRoot) {
  return [...readLedger(repositoryRoot).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createFeedback(repositoryRoot, input, now = new Date()) {
  const body = bounded(input?.body, "Feedback body", 3, 2000);
  const kind = bounded(input?.kind, "Feedback kind", 1, 20);
  if (!KINDS.has(kind)) throw new Error("Unknown feedback kind.");
  const pagePath = safePath(input?.pagePath);
  const pageLabel = bounded(input?.pageLabel, "Page label", 1, 120);
  const createdAt = now.toISOString();
  const record = Object.freeze({
    id: `${now.getTime()}-${crypto.randomUUID()}`,
    kind, body, pagePath, pageLabel,
    status: "open",
    createdAt,
    updatedAt: createdAt,
  });
  appendEvent(repositoryRoot, { schemaVersion: 1, type: "feedback.created", record });
  appendWake(repositoryRoot, record.id, createdAt);
  return record;
}

export function transitionFeedback(repositoryRoot, id, status, detail = {}, now = new Date()) {
  if (!STATUSES.has(status)) throw new Error("Unknown feedback status.");
  const records = readLedger(repositoryRoot);
  const current = records.get(id);
  if (!current) throw new Error("Feedback record not found.");
  const allowed = {
    open: new Set(["in_progress", "waiting", "dismissed"]),
    in_progress: new Set(["waiting", "resolved", "dismissed"]),
    waiting: new Set(["in_progress", "dismissed"]),
    resolved: new Set(["open"]),
    dismissed: new Set(["open"]),
  };
  if (!allowed[current.status].has(status)) throw new Error(`Invalid feedback transition: ${current.status} to ${status}.`);
  const event = { schemaVersion: 1, type: "feedback.status-changed", id, status, at: now.toISOString() };
  if (status === "resolved") event.resolution = bounded(detail.resolution, "Resolution evidence", 20, 2000);
  if (status === "waiting") event.waitReason = bounded(detail.waitReason, "Waiting reason", 5, 1000);
  if (status === "open" && detail.reason) event.reopenReason = bounded(detail.reason, "Reopen reason", 3, 1000);
  appendEvent(repositoryRoot, event);
  if (status === "open" || status === "in_progress") appendWake(repositoryRoot, id, event.at);
  return readLedger(repositoryRoot).get(id);
}

export function nextFeedback(repositoryRoot) {
  const records = listFeedback(repositoryRoot);
  return records.find((record) => record.status === "in_progress") || records.find((record) => record.status === "open") || null;
}

export function stopOutcome(repositoryRoot) {
  const records = listFeedback(repositoryRoot);
  const actionable = records.filter((record) => record.status === "open" || record.status === "in_progress");
  if (actionable.length) {
    const next = actionable.find((record) => record.status === "in_progress") || actionable[0];
    return { mode: "active", block: true, reference: next.id, message: `Actionable feedback remains. Continue record ${next.id} through the public feedback command.` };
  }
  const waiting = records.find((record) => record.status === "waiting");
  if (waiting) return { mode: "waiting", block: false, reference: waiting.id, message: `Feedback ${waiting.id} is waiting on a real external dependency.` };
  return { mode: "idle", block: false, reference: null, message: "No actionable feedback remains." };
}

function readLedger(repositoryRoot) {
  const file = ledgerPath(repositoryRoot);
  if (!fs.existsSync(file)) return new Map();
  const source = fs.readFileSync(file, "utf8");
  const records = new Map();
  const lines = source.split("\n").filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); } catch { throw new Error(`Feedback ledger is corrupt at line ${index + 1}.`); }
    if (event?.schemaVersion !== 1) throw new Error(`Feedback ledger has an unsupported event at line ${index + 1}.`);
    if (event.type === "feedback.created") {
      validateRecord(event.record);
      if (records.has(event.record.id)) throw new Error(`Feedback ledger repeats ID ${event.record.id}.`);
      records.set(event.record.id, { ...event.record });
    } else if (event.type === "feedback.status-changed") {
      const current = records.get(event.id);
      if (!current || !STATUSES.has(event.status)) throw new Error(`Feedback ledger has an invalid transition at line ${index + 1}.`);
      records.set(event.id, { ...current, status: event.status, updatedAt: event.at, ...(event.resolution ? { resolution: event.resolution } : {}), ...(event.waitReason ? { waitReason: event.waitReason } : {}) });
    } else throw new Error(`Feedback ledger has an unknown event at line ${index + 1}.`);
  }
  return records;
}

function validateRecord(record) {
  if (!record || typeof record !== "object" || !KINDS.has(record.kind) || record.status !== "open") throw new Error("Feedback ledger contains an invalid record.");
  bounded(record.id, "Feedback ID", 10, 128); bounded(record.body, "Feedback body", 3, 2000); safePath(record.pagePath); bounded(record.pageLabel, "Page label", 1, 120);
  if (Number.isNaN(Date.parse(record.createdAt)) || record.updatedAt !== record.createdAt) throw new Error("Feedback ledger contains invalid timestamps.");
}

function appendEvent(repositoryRoot, event) {
  const dir = runtimeDirectory(repositoryRoot);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  withLock(dir, () => fs.appendFileSync(ledgerPath(repositoryRoot), `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }));
}

function appendWake(repositoryRoot, id, at) {
  const dir = runtimeDirectory(repositoryRoot);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(path.join(dir, "wake.jsonl"), `${JSON.stringify({ schemaVersion: 1, type: "feedback.ready", id, at })}\n`, { encoding: "utf8", mode: 0o600 });
}

function withLock(directory, operation) {
  const lock = path.join(directory, "feedback.lock");
  let descriptor;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { descriptor = fs.openSync(lock, "wx", 0o600); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) fs.unlinkSync(lock); } catch {}
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  if (descriptor === undefined) throw new Error("Feedback ledger is busy.");
  try { return operation(); } finally { fs.closeSync(descriptor); try { fs.unlinkSync(lock); } catch {} }
}

function bounded(value, label, minimum, maximum) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const clean = value.trim();
  if (clean.length < minimum || clean.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) throw new Error(`${label} must be between ${minimum} and ${maximum} safe characters.`);
  return clean;
}
function safePath(value) { const clean = bounded(value, "Page path", 1, 240); if (!clean.startsWith("/") || clean.includes("..") || clean.includes("\\")) throw new Error("Invalid page path."); return clean; }
function runtimeDirectory(root) { return path.join(path.resolve(root), ".origin"); }
function ledgerPath(root) { return path.join(runtimeDirectory(root), "feedback.jsonl"); }

