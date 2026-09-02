import { validateCreatedRecord, validateTransitionEvent } from "./contracts.mjs";
const ALLOWED = Object.freeze({ open: Object.freeze(["in_progress", "waiting", "dismissed"]), in_progress: Object.freeze(["waiting", "resolved", "dismissed"]), waiting: Object.freeze(["in_progress", "dismissed"]), resolved: Object.freeze(["open"]), dismissed: Object.freeze(["open"]) });

export function applyEvent(records, event) {
  if (event?.schemaVersion !== 1) throw new Error("Feedback ledger contains an unsupported event.");
  if (event.type === "feedback.created") {
    validateCreatedRecord(event.record);
    if (records.has(event.record.id)) throw new Error(`Feedback ledger repeats ID ${event.record.id}.`);
    records.set(event.record.id, Object.freeze({ ...event.record })); return;
  }
  validateTransitionEvent(event);
  const current = records.get(event.id);
  if (!current) throw new Error("Feedback transition references a missing record.");
  assertTransition(current.status, event.status);
  if (event.at < current.updatedAt) throw new Error("Feedback transition timestamp moves backward.");
  if (event.status === "in_progress" && [...records.values()].some((record) => record.id !== event.id && record.status === "in_progress")) throw new Error("Only one feedback record may be in progress.");
  const { resolution: _resolution, waitReason: _waitReason, dismissalReason: _dismissalReason, reopenReason: _reopenReason, ...base } = current;
  records.set(event.id, Object.freeze({ ...base, status: event.status, updatedAt: event.at, ...(event.resolution ? { resolution: event.resolution } : {}), ...(event.waitReason ? { waitReason: event.waitReason } : {}), ...(event.dismissalReason ? { dismissalReason: event.dismissalReason } : {}), ...(event.reopenReason ? { reopenReason: event.reopenReason } : {}) }));
}
export function assertTransition(current, next) { if (!ALLOWED[current]?.includes(next)) throw new Error(`Invalid feedback transition: ${current} to ${next}.`); }
export function selectNext(records) { const ordered = orderedRecords(records); return ordered.find((record) => record.status === "in_progress") || ordered.find((record) => record.status === "open") || null; }
export function deriveStopOutcome(records) { const next = selectNext(records); if (next) return Object.freeze({ mode: "active", block: true, reference: next.id, voiceId: "stop.active" }); const waiting = orderedRecords(records).find((record) => record.status === "waiting"); if (waiting) return Object.freeze({ mode: "waiting", block: false, reference: waiting.id, voiceId: "stop.waiting" }); return Object.freeze({ mode: "idle", block: false, reference: null, voiceId: null }); }
export function orderedRecords(records) { return [...records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((record) => Object.freeze({ ...record })); }
