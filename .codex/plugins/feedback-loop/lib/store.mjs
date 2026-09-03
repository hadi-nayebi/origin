import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { applyEvent } from "./policy.mjs";
import {
  CURRENT_SCHEMA_VERSION,
  GENESIS_HASH,
  sealEvent,
  upgradeEvents,
  verifyEnvelope,
} from "./integrity.mjs";

const waitArray = new Int32Array(new SharedArrayBuffer(4));
const BACKUP_LIMIT = 20;

export function readFeedbackState(repositoryRoot) {
  return readLedger(repositoryRoot).records;
}

export function inspectFeedbackLedger(repositoryRoot) {
  const result = readLedger(repositoryRoot);
  return Object.freeze({
    valid: true,
    events: result.events.length,
    records: result.records.size,
    schemaVersion: result.events.length
      ? result.events.at(-1).schemaVersion
      : CURRENT_SCHEMA_VERSION,
    migrationRequired: result.migrationRequired,
  });
}

export function appendFeedbackEvent(repositoryRoot, createEvent) {
  const directory = runtimeDirectory(repositoryRoot);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withFeedbackLock(directory, () => {
    const current = readLedger(repositoryRoot);
    const records = new Map(current.records);
    const proposed = createEvent(new Map(records));
    if (proposed == null) return { event: null, records };
    const previousHash = current.events.at(-1)?.hash || GENESIS_HASH;
    const event = sealEvent(proposed, current.events.length + 1, previousHash);
    applyEvent(records, event);
    publishLedger(repositoryRoot, [...current.events, event], { backup: true });
    return { event, records };
  });
}

export function migrateFeedbackLedger(repositoryRoot) {
  const directory = runtimeDirectory(repositoryRoot);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withFeedbackLock(directory, () => {
    const current = readLedger(repositoryRoot);
    if (current.migrationRequired) publishLedger(repositoryRoot, current.events, { backup: true });
    return inspectFeedbackLedger(repositoryRoot);
  });
}

export function listFeedbackBackups(repositoryRoot) {
  const directory = backupDirectory(repositoryRoot);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => /^feedback-[0-9T.Z-]+-[a-f0-9]{8}\.jsonl$/.test(name))
    .sort()
    .reverse();
}

export function restoreFeedbackBackup(repositoryRoot, name) {
  if (typeof name !== "string" || !/^feedback-[0-9T.Z-]+-[a-f0-9]{8}\.jsonl$/.test(name))
    throw new Error("Invalid feedback backup name.");
  const directory = runtimeDirectory(repositoryRoot);
  const source = path.join(backupDirectory(repositoryRoot), name);
  if (!fs.existsSync(source)) throw new Error("Feedback backup not found.");
  return withFeedbackLock(directory, () => {
    const restored = parseLedger(fs.readFileSync(source, "utf8"));
    publishLedger(repositoryRoot, restored.events, { backup: true });
    return inspectFeedbackLedger(repositoryRoot);
  });
}

function readLedger(repositoryRoot) {
  const file = ledgerPath(repositoryRoot);
  if (!fs.existsSync(file)) return { records: new Map(), events: [], migrationRequired: false };
  return parseLedger(fs.readFileSync(file, "utf8"));
}

function parseLedger(source) {
  const rawEvents = source
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Feedback ledger is corrupt at line ${index + 1}.`);
      }
    });
  const versions = new Set(rawEvents.map((event) => event?.schemaVersion));
  if ([...versions].some((version) => version !== 1 && version !== CURRENT_SCHEMA_VERSION))
    throw new Error("Feedback ledger contains an unsupported event version.");
  if (versions.size > 1) throw new Error("Feedback ledger mixes schema versions.");
  const migrationRequired = versions.has(1);
  const events = migrationRequired ? upgradeEvents(rawEvents) : rawEvents;
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
  return { records, events, migrationRequired };
}

function publishLedger(repositoryRoot, events, options = {}) {
  const directory = runtimeDirectory(repositoryRoot);
  const file = ledgerPath(repositoryRoot);
  const source = events.length
    ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
    : "";
  if (options.backup && fs.existsSync(file))
    createBackup(repositoryRoot, fs.readFileSync(file, "utf8"));
  const temporary = path.join(directory, `feedback-${process.pid}-${crypto.randomUUID()}.next`);
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, source, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
  syncDirectory(directory);
}

function createBackup(repositoryRoot, source) {
  const directory = backupDirectory(repositoryRoot);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const name = `feedback-${timestamp}-${crypto.randomBytes(4).toString("hex")}.jsonl`;
  const file = path.join(directory, name);
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, source, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  syncDirectory(directory);
  for (const old of listFeedbackBackups(repositoryRoot).slice(BACKUP_LIMIT))
    fs.unlinkSync(path.join(directory, old));
}

function withFeedbackLock(directory, operation) {
  const lock = path.join(directory, "feedback.lock");
  const token = crypto.randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      descriptor = fs.openSync(lock, "wx", 0o600);
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
      clearDeadLock(lock);
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  if (descriptor === undefined) throw new Error("Feedback ledger is busy.");
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
      if (owner.token === token) fs.unlinkSync(lock);
    } catch {}
  }
}

function clearDeadLock(lock) {
  try {
    const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
    const age = Date.now() - Date.parse(owner.createdAt);
    if (!Number.isFinite(age) || age > 60_000) {
      fs.unlinkSync(lock);
      return;
    }
    if (owner.host !== os.hostname() || !Number.isInteger(owner.pid)) return;
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") fs.unlinkSync(lock);
    }
  } catch {
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) fs.unlinkSync(lock);
    } catch {}
  }
}

function syncDirectory(directory) {
  if (process.platform === "win32") return;
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch {
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
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
