import crypto from "node:crypto";
import { setAgentState } from "../../agent-stop-state/lib/state.mjs";
import { bounded, normalizeCreateInput, normalizeId, normalizeMessage } from "./contracts.mjs";
import { deriveFeedbackMode, orderedRecords, selectNext } from "./policy.mjs";
import {
  appendFeedbackEvent,
  inspectFeedbackLedger,
  listFeedbackBackups,
  readFeedbackEvents,
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
  return createFeedbackMutation(root, input, now).record;
}

export function createFeedbackMutation(root, input, now = new Date()) {
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
  const result = appendFeedbackEvent(root, (records) => {
    if (records.has(id)) throw new Error("Feedback ID collision.");
    return { type: "feedback.created", record };
  });
  reconcileAgentState(root, now);
  return mutationResult(result, id);
}

export function addFeedbackMessage(root, id, input, options = {}, now = new Date()) {
  return addFeedbackMessageMutation(root, id, input, options, now).record;
}

export function addFeedbackMessageMutation(root, id, input, options = {}, now = new Date()) {
  const safeId = normalizeId(id);
  const role = options.role || "user";
  const messageId = `msg-${crypto.randomUUID()}`;
  const result = appendFeedbackEvent(root, (records) => {
    const current = records.get(safeId);
    if (!current) throw new Error("Feedback record not found.");
    const message = normalizeMessage(
      role === "user"
        ? { ...input, role: "user", type: current.status === "waiting" ? "answer" : "comment" }
        : input,
      role,
      now,
      messageId,
    );
    if (message.type !== "review" && !["open", "in_progress", "waiting"].includes(current.status))
      throw new Error("Closed feedback must be reopened before adding conversation.");
    if (role === "user" && current.status === "waiting")
      return {
        type: "feedback.message-transitioned",
        id: safeId,
        at: now.toISOString(),
        message,
        status: "open",
        reason: "User supplied the recorded input; this responsibility is runnable again.",
      };
    return { type: "feedback.message-added", id: safeId, at: now.toISOString(), message };
  });
  reconcileAgentState(root, now);
  return mutationResult(result, safeId);
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
  if (["resolved", "dismissed"].includes(status))
    throw new Error("User-owned resolution and dismissal require the dashboard review operation.");
  const result = appendFeedbackEvent(root, (records) => {
    const current = records.get(safeId);
    if (!current) throw new Error("Feedback record not found.");
    if (status === "open" && ["ready_for_review", "resolved", "dismissed"].includes(current.status))
      throw new Error("User-owned reopening requires the dashboard review operation.");
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
  const safeId = normalizeId(id);
  const message = normalizeMessage(
    { role: "agent", type: "question", body: question },
    "agent",
    now,
    `msg-${crypto.randomUUID()}`,
  );
  const result = appendFeedbackEvent(root, (records) => {
    const current = records.get(safeId);
    if (!current) throw new Error("Feedback record not found.");
    if (!["open", "in_progress"].includes(current.status))
      throw new Error("Only actionable feedback may ask a question.");
    return {
      type: "feedback.message-transitioned",
      id: safeId,
      at: now.toISOString(),
      message,
      status: "waiting",
      reason: question,
    };
  });
  reconcileAgentState(root, now);
  return result.records.get(safeId);
}

export function reviewFeedback(root, id, status, detail = {}, now = new Date()) {
  return reviewFeedbackMutation(root, id, status, detail, now).record;
}

export function reviewFeedbackMutation(root, id, status, detail = {}, now = new Date()) {
  if (!["resolved", "open", "dismissed"].includes(status))
    throw new Error("Dashboard may only accept, reopen, or dismiss feedback.");
  const safeId = normalizeId(id);
  const body = status === "resolved" ? detail.acceptance || "Accepted by user." : detail.reason;
  const message = normalizeMessage(
    { role: "user", type: "review", body },
    "user",
    now,
    `msg-${crypto.randomUUID()}`,
  );
  const result = appendFeedbackEvent(root, (records) => {
    if (!records.has(safeId)) throw new Error("Feedback record not found.");
    const event = {
      type: "feedback.message-transitioned",
      id: safeId,
      at: now.toISOString(),
      message,
      status,
    };
    if (status === "resolved") event.acceptance = body;
    else event.reason = body;
    return event;
  });
  reconcileAgentState(root, now);
  return mutationResult(result, safeId);
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

export function feedbackWakeIntents(root) {
  const records = readFeedbackState(root);
  const latest = new Map();
  for (const event of readFeedbackEvents(root)) {
    const kind = wakeKind(event);
    if (!kind) continue;
    latest.set(event.record?.id || event.id, Object.freeze({ event, kind }));
  }
  return Object.freeze(
    [...latest.entries()].flatMap(([id, value]) => {
      const record = records.get(id);
      if (!record || !wakeMatchesCurrentRecord(value.kind, record.status)) return [];
      return [
        Object.freeze({
          kind: value.kind,
          reference: id,
          route: record.pagePath,
          sourceEventHash: value.event.hash,
          sourceSequence: value.event.sequence,
        }),
      ];
    }),
  );
}

function wakeMatchesCurrentRecord(kind, status) {
  if (kind === "feedback.accepted") return status === "resolved";
  if (kind === "feedback.dismissed") return status === "dismissed";
  return ["open", "in_progress"].includes(status);
}

function wakeKind(event) {
  if (event.type === "feedback.created") return "feedback.new";
  if (event.type === "feedback.message-added" && event.message.role === "user")
    return "feedback.during-active";
  if (event.type !== "feedback.message-transitioned" || event.message.role !== "user") return null;
  if (event.message.type === "answer") return "feedback.answer";
  if (event.status === "resolved") return "feedback.accepted";
  if (event.status === "dismissed") return "feedback.dismissed";
  if (event.status === "open") return "feedback.reopened";
  return null;
}

function mutationResult(result, id) {
  return Object.freeze({ event: result.event, record: result.records.get(id) });
}
