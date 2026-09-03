import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyEvent } from "./policy.mjs";
import { CURRENT_SCHEMA_VERSION, GENESIS_HASH, sealEvent, verifyEnvelope } from "./integrity.mjs";

const waitArray = new Int32Array(new SharedArrayBuffer(4));
const BACKUP_LIMIT = 20;

export function readFeedbackState(root) {
  return readLedger(root).records;
}

export function inspectFeedbackLedger(root) {
  const result = readLedger(root);
  return Object.freeze({
    valid: true,
    events: result.events.length,
    records: result.records.size,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

export function appendFeedbackEvent(root, createEvent) {
  const directory = runtimeDirectory(root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withLock(directory, () => {
    const current = readLedger(root);
    const proposed = createEvent(new Map(current.records));
    if (proposed == null) return { event: null, records: current.records };
    const event = sealEvent(
      proposed,
      current.events.length + 1,
      current.events.at(-1)?.hash || GENESIS_HASH,
    );
    const records = new Map(current.records);
    applyEvent(records, event);
    publishLedger(root, [...current.events, event], { backup: true });
    return { event, records };
  });
}

export function listFeedbackBackups(root) {
  const directory = backupDirectory(root);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => /^feedback-[0-9T.Z-]+-[a-f0-9]{8}\.jsonl$/.test(name))
    .sort()
    .reverse();
}

export function restoreFeedbackBackup(root, name) {
  if (typeof name !== "string" || !/^feedback-[0-9T.Z-]+-[a-f0-9]{8}\.jsonl$/.test(name))
    throw new Error("Invalid feedback backup name.");
  const source = path.join(backupDirectory(root), name);
  if (!fs.existsSync(source)) throw new Error("Feedback backup not found.");
  return withLock(runtimeDirectory(root), () => {
    const restored = parseLedger(fs.readFileSync(source, "utf8"));
    publishLedger(root, restored.events, { backup: true });
    return inspectFeedbackLedger(root);
  });
}

function readLedger(root) {
  const file = ledgerPath(root);
  if (!fs.existsSync(file)) return { records: new Map(), events: [] };
  return parseLedger(fs.readFileSync(file, "utf8"));
}

function parseLedger(source) {
  const events = source
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Feedback ledger is corrupt at line ${index + 1}.`);
      }
    });
  const records = new Map();
  let previousHash = GENESIS_HASH;
  for (let index = 0; index < events.length; index += 1) {
    try {
      previousHash = verifyEnvelope(events[index], index + 1, previousHash);
      applyEvent(records, events[index]);
    } catch (error) {
      throw new Error(`Feedback ledger is invalid at line ${index + 1}: ${error.message}`);
    }
  }
  return { records, events };
}

function publishLedger(root, events, options = {}) {
  const directory = runtimeDirectory(root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = ledgerPath(root);
  const source = events.length
    ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
    : "";
  if (options.backup && fs.existsSync(file)) createBackup(root, fs.readFileSync(file, "utf8"));
  const temporary = path.join(directory, `feedback-${process.pid}-${crypto.randomUUID()}.next`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, source, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function createBackup(root, source) {
  const directory = backupDirectory(root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const name = `feedback-${new Date().toISOString().replace(/:/g, "-")}-${crypto.randomBytes(4).toString("hex")}.jsonl`;
  fs.writeFileSync(path.join(directory, name), source, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  for (const old of listFeedbackBackups(root).slice(BACKUP_LIMIT))
    fs.unlinkSync(path.join(directory, old));
}

function withLock(directory, operation) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "feedback.lock");
  const token = crypto.randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          pid: process.pid,
          host: os.hostname(),
          token,
          createdAt: new Date().toISOString(),
        }),
      );
      fs.fsyncSync(descriptor);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearDeadLock(file);
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  if (descriptor === undefined) throw new Error("Feedback ledger is busy.");
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      if (JSON.parse(fs.readFileSync(file, "utf8")).token === token) fs.unlinkSync(file);
    } catch {}
  }
}

function clearDeadLock(file) {
  try {
    const owner = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - Date.parse(owner.createdAt) > 60_000) return fs.unlinkSync(file);
    if (owner.host !== os.hostname() || !Number.isInteger(owner.pid)) return;
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") fs.unlinkSync(file);
    }
  } catch {}
}

function runtimeDirectory(root) {
  return path.join(path.resolve(root), ".origin");
}
function backupDirectory(root) {
  return path.join(runtimeDirectory(root), "backups");
}
function ledgerPath(root) {
  return path.join(runtimeDirectory(root), "feedback.jsonl");
}
