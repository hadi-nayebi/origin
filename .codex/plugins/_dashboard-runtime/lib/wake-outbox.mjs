import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFeedback } from "../../contextual-feedback/lib/service.mjs";
import { readAgentState } from "../../agent-stop-state/lib/state.mjs";
import { renderVoice } from "../../contextual-feedback/lib/voice.mjs";
import { deliverCodexWake } from "./codex-wake-v1.mjs";

const waitArray = new Int32Array(new SharedArrayBuffer(4));
const activeDeliveries = new Set();
const timers = new Map();
const TERMINAL_HISTORY_LIMIT = 200;
const voiceFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contextual-feedback/voice.xml",
);

export function enqueueFeedbackWake(root, input, now = new Date()) {
  const reference = bounded(input?.reference, "Wake reference", 10, 128);
  const route = bounded(input?.route || "/", "Wake route", 1, 160);
  const kind = bounded(input?.kind, "Wake kind", 3, 64);
  const sourceEventHash = hash(input?.sourceEventHash, "Wake source event hash");
  const sourceSequence = positiveInteger(input?.sourceSequence, "Wake source sequence");
  const id = `wake-${crypto.randomUUID()}`;
  const marker = markerFor(id);
  const prompt = renderVoice(voiceFile, kind, {
    reference,
    route,
    activeReference: input?.activeReference || reference,
    wakeMarker: marker,
  });
  const event = {
    id,
    schemaVersion: 2,
    kind,
    reference,
    sourceEventHash,
    sourceSequence,
    route,
    marker,
    prompt,
    status: "pending",
    attempts: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    nextAttemptAt: now.toISOString(),
    result: null,
    error: null,
  };
  mutateOutbox(root, (events) => compactOutbox([...events, event]));
  return Object.freeze({ ...event });
}

export function hasFeedbackWakeForEvent(root, sourceEventHash) {
  const safeHash = hash(sourceEventHash, "Wake source event hash");
  return readOutbox(root).some(
    (event) => event.sourceEventHash === safeHash && event.status !== "cancelled",
  );
}

export async function deliverPendingWakes(root, options = {}) {
  const key = path.resolve(root);
  if (activeDeliveries.has(key)) return wakeStatus(root);
  activeDeliveries.add(key);
  try {
    const deliver = options.deliver || ((input) => deliverCodexWake(root, input, options));
    const clock = options.clock || (() => options.now || new Date());
    while (true) {
      const claimed = claimNextWake(root, clock());
      if (!claimed) break;
      try {
        const result = await deliver({ prompt: claimed.prompt, marker: claimed.marker });
        finishWake(root, claimed.id, { result }, clock());
      } catch (error) {
        finishWake(
          root,
          claimed.id,
          { error: error instanceof Error ? error.message : String(error) },
          clock(),
        );
      }
    }
    return wakeStatus(root);
  } finally {
    activeDeliveries.delete(key);
  }
}

export function scheduleWakeDelivery(root, options = {}) {
  const key = path.resolve(root);
  if (timers.has(key)) return;
  const delay = options.delayMs ?? nextWakeDelay(root);
  const timer = setTimeout(async () => {
    timers.delete(key);
    try {
      const status = await deliverPendingWakes(root, options);
      if (status.pending > 0) scheduleWakeDelivery(root, options);
    } catch (error) {
      console.error(`Origin wake delivery failed: ${error.message}`);
      scheduleWakeDelivery(root, options);
    }
  }, delay);
  timer.unref?.();
  timers.set(key, timer);
}

export async function retryWakeDelivery(root, options = {}) {
  const key = path.resolve(root);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  const status = await deliverPendingWakes(root, options);
  if (status.pending > 0) scheduleWakeDelivery(root, options);
  return status;
}

export function wakeStatus(root) {
  const events = readOutbox(root);
  const pending = events.filter((event) =>
    ["pending", "retrying", "delivering"].includes(event.status),
  ).length;
  const last = events.at(-1) || null;
  return Object.freeze({
    state: pending
      ? last?.status === "retrying"
        ? "retrying"
        : "pending"
      : last?.status === "delivered"
        ? "connected"
        : "idle",
    transport: "tmux",
    pending,
    last: last
      ? Object.freeze({
          id: last.id,
          kind: last.kind,
          reference: last.reference,
          status: last.status,
          attempts: last.attempts,
          updatedAt: last.updatedAt,
          result: last.result,
          error: last.error,
        })
      : null,
  });
}

function claimNextWake(root, now) {
  let claimed = null;
  mutateOutbox(root, (events) => {
    for (const event of events) {
      if (
        event.status === "delivering" &&
        now.getTime() - Date.parse(event.claimedAt || event.updatedAt) > 30_000
      ) {
        event.status = "retrying";
        event.error = "Recovered an interrupted wake delivery claim.";
        event.nextAttemptAt = now.toISOString();
        delete event.claimedAt;
        delete event.claimedBy;
      }
    }
    for (const event of events) {
      if (
        !["pending", "retrying"].includes(event.status) ||
        event.nextAttemptAt > now.toISOString()
      )
        continue;
      const guard = wakeGuard(root, event);
      if (guard === "cancel") {
        event.status = "cancelled";
        event.updatedAt = now.toISOString();
        event.error = "Referenced feedback no longer requires this wake.";
        continue;
      }
      if (guard === "paused") break;
      event.status = "delivering";
      event.attempts += 1;
      event.updatedAt = now.toISOString();
      event.claimedAt = now.toISOString();
      event.claimedBy = `${os.hostname()}:${process.pid}`;
      claimed = { ...event };
      break;
    }
    return compactOutbox(events);
  });
  return claimed;
}

function finishWake(root, id, outcome, now) {
  mutateOutbox(root, (events) => {
    const event = events.find((item) => item.id === id);
    if (!event || event.status !== "delivering") return events;
    delete event.claimedAt;
    delete event.claimedBy;
    event.updatedAt = now.toISOString();
    if (outcome.error) {
      event.status = "retrying";
      event.error = String(outcome.error)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .slice(0, 500);
      event.nextAttemptAt = new Date(
        now.getTime() + Math.min(60_000, 1_000 * 2 ** Math.min(event.attempts - 1, 6)),
      ).toISOString();
    } else {
      event.status = "delivered";
      event.result = outcome.result;
      event.error = null;
    }
    return compactOutbox(events);
  });
}

function wakeGuard(root, event) {
  try {
    if (readAgentState(root).mode === "paused") return "paused";
    const feedback = getFeedback(root, event.reference);
    if (event.kind === "feedback.accepted")
      return feedback.status === "resolved" ? "deliver" : "cancel";
    if (event.kind === "feedback.dismissed")
      return feedback.status === "dismissed" ? "deliver" : "cancel";
    if (event.kind === "feedback.reopened")
      return feedback.status === "open" ? "deliver" : "cancel";
    if (event.kind === "feedback.answer")
      return ["open", "in_progress"].includes(feedback.status) ? "deliver" : "cancel";
    return ["open", "in_progress", "waiting", "ready_for_review"].includes(feedback.status)
      ? "deliver"
      : "cancel";
  } catch {
    return "cancel";
  }
}

function mutateOutbox(root, mutation) {
  return withOutboxLease(root, () => {
    const next = mutation(readOutbox(root));
    writeOutbox(root, next);
    return next;
  });
}

function withOutboxLease(root, operation) {
  const directory = path.join(path.resolve(root), ".origin");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "wake-outbox.lock");
  const token = crypto.randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          token,
          pid: process.pid,
          host: os.hostname(),
          at: new Date().toISOString(),
        }),
      );
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearStaleLease(file);
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  if (descriptor === undefined) throw new Error("Wake outbox is busy.");
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      if (JSON.parse(fs.readFileSync(file, "utf8")).token === token) fs.unlinkSync(file);
    } catch {}
  }
}

function clearStaleLease(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - Date.parse(value.at) > 30_000) fs.unlinkSync(file);
  } catch {}
}

function nextWakeDelay(root) {
  try {
    if (readAgentState(root).mode === "paused") return 60_000;
  } catch {}
  const now = Date.now();
  const timestamps = readOutbox(root)
    .filter((event) => ["pending", "retrying", "delivering"].includes(event.status))
    .map((event) =>
      event.status === "delivering"
        ? Date.parse(event.claimedAt || event.updatedAt) + 30_000
        : Date.parse(event.nextAttemptAt || event.updatedAt),
    )
    .filter(Number.isFinite);
  if (!timestamps.length) return 250;
  return Math.max(25, Math.min(60_000, Math.min(...timestamps) - now));
}

function readOutbox(root) {
  try {
    const value = JSON.parse(fs.readFileSync(outboxPath(root), "utf8"));
    if (!Array.isArray(value)) throw new Error("Wake outbox is invalid.");
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function writeOutbox(root, events) {
  const file = outboxPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.next`;
  fs.writeFileSync(temporary, `${JSON.stringify(events, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporary, file);
}
function outboxPath(root) {
  return path.join(path.resolve(root), ".origin", "wake-outbox.json");
}
function markerFor(id) {
  return `[ORIGIN WAKE ${id}]`;
}
function bounded(value, label, minimum, maximum) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(`${label} is invalid.`);
  return value;
}
function hash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(`${label} is invalid.`);
  return value;
}
function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} is invalid.`);
  return number;
}
function compactOutbox(events) {
  const terminal = events.filter((event) => ["delivered", "cancelled"].includes(event.status));
  const keepTerminal = new Set(terminal.slice(-TERMINAL_HISTORY_LIMIT).map((event) => event.id));
  return events.filter(
    (event) => !["delivered", "cancelled"].includes(event.status) || keepTerminal.has(event.id),
  );
}
