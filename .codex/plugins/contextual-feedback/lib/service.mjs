import crypto from "node:crypto";
import { setAgentState } from "../../agent-stop-state/lib/state.mjs";
import { bounded, normalizeCreateInput, normalizeId, normalizeMessage } from "./contracts.mjs";
import { deriveFeedbackMode, orderedRecords, selectNext } from "./policy.mjs";
import {
  appendFeedbackEvent,
  inspectFeedbackLedger,
  listFeedbackBackups,
  readFeedbackState,
  restoreFeedbackBackup,
} from "./store.mjs";

export function listFeedback(root) {
  return orderedRecords(readFeedbackState(root));
}

export function getFeedback(root, id) {
  const record = readFeedbackState(root).get(normalizeId(id));
  if (!record) throw new Error("Feedback record not found.");
  return record;
}

export function nextFeedback(root) {
  return selectNext(readFeedbackState(root));
}

export function feedbackMode(root) {
  return deriveFeedbackMode(readFeedbackState(root));
}

export function reconcileAgentState(root, now = new Date()) {
  return setAgentState(root, feedbackMode(root), {}, now);
}

export function createFeedback(root, input, now = new Date()) {
  const clean = normalizeCreateInput(input);
  const at = now.toISOString();
  const id = `${now.getTime()}-${crypto.randomUUID()}`;
  const initialMessage = normalizeMessage(
    { role: "user", type: "comment", body: clean.body },
    "user",
    now,
    `msg-${crypto.randomUUID()}`,
  );
  const record = Object.freeze({
    id,
    ...clean,
    status: "open",
    createdAt: at,
    updatedAt: at,
    messages: [initialMessage],
    classification: null,
    interpretation: null,
    linkedWork: [],
    verification: null,
    acceptance: null,
  });
  appendFeedbackEvent(root, (records) => {
    if (records.has(id)) throw new Error("Feedback ID collision.");
    return { type: "feedback.created", record };
  });
  reconcileAgentState(root, now);
  return getFeedback(root, id);
}

export function addFeedbackMessage(root, id, input, options = {}, now = new Date()) {
  const safeId = normalizeId(id);
  const role = options.role || "user";
  const message = normalizeMessage(input, role, now, `msg-${crypto.randomUUID()}`);
  const result = appendFeedbackEvent(root, (records) => {
    const current = records.get(safeId);
    if (!current) throw new Error("Feedback record not found.");
    if (message.type !== "review" && !["open", "in_progress", "waiting"].includes(current.status))
      throw new Error("Closed feedback must be reopened before adding conversation.");
    return { type: "feedback.message-added", id: safeId, at: now.toISOString(), message };
  });
  let record = result.records.get(safeId);
  if (role === "user" && record.status === "waiting")
    record = transitionFeedback(
      root,
      safeId,
      "open",
      { reason: "User supplied new thread input." },
      now,
    );
  else reconcileAgentState(root, now);
  return record;
}

export function interpretFeedback(root, id, detail, now = new Date()) {
  const safeId = normalizeId(id);
  const result = appendFeedbackEvent(root, (records) => {
    if (!records.has(safeId)) throw new Error("Feedback record not found.");
    return {
      type: "feedback.interpreted",
      id: safeId,
      at: now.toISOString(),
      classification: bounded(detail?.classification, "Classification", 3, 80),
      interpretation: bounded(detail?.interpretation, "Interpretation", 3, 2000),
    };
  });
  reconcileAgentState(root, now);
  return result.records.get(safeId);
}

export function linkFeedbackWork(root, id, workReference, now = new Date()) {
  const safeId = normalizeId(id);
  const result = appendFeedbackEvent(root, (records) => {
    if (!records.has(safeId)) throw new Error("Feedback record not found.");
    return {
      type: "feedback.work-linked",
      id: safeId,
      at: now.toISOString(),
      workReference: bounded(workReference, "Work reference", 3, 240),
    };
  });
  reconcileAgentState(root, now);
  return result.records.get(safeId);
}

export function transitionFeedback(root, id, status, detail = {}, now = new Date()) {
  const safeId = normalizeId(id);
  const result = appendFeedbackEvent(root, (records) => {
    if (!records.has(safeId)) throw new Error("Feedback record not found.");
    const event = { type: "feedback.status-changed", id: safeId, status, at: now.toISOString() };
    if (["waiting", "dismissed", "open"].includes(status)) event.reason = detail.reason;
    if (status === "ready_for_review") event.verification = detail.verification;
    if (status === "resolved") event.acceptance = detail.acceptance;
    return event;
  });
  reconcileAgentState(root, now);
  return result.records.get(safeId);
}

export function askFeedbackQuestion(root, id, question, now = new Date()) {
  const record = getFeedback(root, id);
  if (!["open", "in_progress"].includes(record.status))
    throw new Error("Only actionable feedback may ask a question.");
  addFeedbackMessage(
    root,
    id,
    { role: "agent", type: "question", body: question },
    { role: "agent" },
    now,
  );
  return transitionFeedback(root, id, "waiting", { reason: question }, new Date(now.getTime() + 1));
}

export function heartbeatFeedback(root, id, now = new Date()) {
  const safeId = normalizeId(id);
  const result = appendFeedbackEvent(root, (records) => {
    const current = records.get(safeId);
    if (!current || current.status !== "in_progress")
      throw new Error("Only focused feedback may receive a heartbeat.");
    return { type: "feedback.heartbeat", id: safeId, at: now.toISOString() };
  });
  reconcileAgentState(root, now);
  return result.records.get(safeId);
}

export function recoverStaleFeedback(root, options = {}, now = new Date()) {
  const maximumAgeMs = Number(options.maximumAgeMs ?? 14_400_000);
  if (!Number.isFinite(maximumAgeMs) || maximumAgeMs < 60_000)
    throw new Error("Recovery age must be at least one minute.");
  let recoveredId = null;
  const result = appendFeedbackEvent(root, (records) => {
    const focused = [...records.values()].find((record) => record.status === "in_progress");
    if (!focused || now.getTime() - Date.parse(focused.updatedAt) < maximumAgeMs) return null;
    recoveredId = focused.id;
    return {
      type: "feedback.status-changed",
      id: focused.id,
      status: "open",
      at: now.toISOString(),
      reason: `Recovered after ${maximumAgeMs} ms without a heartbeat.`,
    };
  });
  reconcileAgentState(root, now);
  return recoveredId ? result.records.get(recoveredId) : null;
}

export function verifyFeedback(root) {
  return inspectFeedbackLedger(root);
}
export function feedbackBackups(root) {
  return listFeedbackBackups(root);
}
export function restoreFeedback(root, name) {
  const result = restoreFeedbackBackup(root, name);
  reconcileAgentState(root);
  return result;
}
