import { validateEvent } from "./contracts.mjs";

const ALLOWED = Object.freeze({
  open: Object.freeze(["in_progress", "waiting", "dismissed"]),
  in_progress: Object.freeze(["open", "waiting", "ready_for_review", "dismissed"]),
  waiting: Object.freeze(["open", "in_progress", "dismissed"]),
  ready_for_review: Object.freeze(["resolved", "open", "in_progress"]),
  resolved: Object.freeze(["open"]),
  dismissed: Object.freeze(["open"]),
});

export function applyEvent(records, event) {
  validateEvent(event);
  if (event.type === "feedback.created") {
    if (records.has(event.record.id))
      throw new Error(`Feedback ledger repeats ID ${event.record.id}.`);
    records.set(event.record.id, freezeRecord(event.record));
    return;
  }
  const current = records.get(event.id);
  if (!current) throw new Error("Feedback event references a missing record.");
  if (event.at < current.updatedAt) throw new Error("Feedback event timestamp moves backward.");
  if (event.type === "feedback.message-added") {
    if (current.messages.some((message) => message.id === event.message.id))
      throw new Error("Feedback message ID is repeated.");
    records.set(
      event.id,
      freezeRecord({
        ...current,
        messages: [...current.messages, event.message],
        updatedAt: event.at,
      }),
    );
    return;
  }
  if (event.type === "feedback.message-transitioned") {
    if (current.messages.some((message) => message.id === event.message.id))
      throw new Error("Feedback message ID is repeated.");
    assertTransition(current.status, event.status);
    assertSingleFocus(records, event);
    records.set(
      event.id,
      transitionedRecord({ ...current, messages: [...current.messages, event.message] }, event),
    );
    return;
  }
  if (event.type === "feedback.interpreted") {
    records.set(
      event.id,
      freezeRecord({
        ...current,
        classification: event.classification,
        interpretation: event.interpretation,
        updatedAt: event.at,
      }),
    );
    return;
  }
  if (event.type === "feedback.work-linked") {
    const linkedWork = current.linkedWork.includes(event.workReference)
      ? current.linkedWork
      : [...current.linkedWork, event.workReference];
    records.set(event.id, freezeRecord({ ...current, linkedWork, updatedAt: event.at }));
    return;
  }
  if (event.type === "feedback.heartbeat") {
    if (current.status !== "in_progress")
      throw new Error("Only focused feedback may receive a heartbeat.");
    records.set(event.id, freezeRecord({ ...current, updatedAt: event.at }));
    return;
  }
  assertTransition(current.status, event.status);
  assertSingleFocus(records, event);
  records.set(event.id, transitionedRecord(current, event));
}

function assertSingleFocus(records, event) {
  if (
    event.status === "in_progress" &&
    [...records.values()].some(
      (record) => record.id !== event.id && record.status === "in_progress",
    )
  )
    throw new Error("Only one feedback thread may be in progress.");
}

function transitionedRecord(current, event) {
  const next = {
    ...current,
    status: event.status,
    updatedAt: event.at,
    waitReason: undefined,
    verification: event.status === "ready_for_review" ? event.verification : current.verification,
    acceptance:
      event.status === "resolved"
        ? event.acceptance
        : event.status === "open"
          ? null
          : current.acceptance,
    dismissalReason: undefined,
    reopenReason: undefined,
  };
  if (event.status === "waiting") next.waitReason = event.reason;
  if (event.status === "dismissed") next.dismissalReason = event.reason;
  if (event.status === "open") {
    next.reopenReason = event.reason;
  }
  return freezeRecord(next);
}

export function assertTransition(current, next) {
  if (!ALLOWED[current]?.includes(next))
    throw new Error(`Invalid feedback transition: ${current} to ${next}.`);
}

export function selectNext(records) {
  const ordered = orderedRecords(records);
  return (
    ordered.find((record) => record.status === "in_progress") ||
    ordered.find((record) => record.status === "open") ||
    null
  );
}

export function deriveFeedbackMode(records) {
  const next = selectNext(records);
  if (next)
    return Object.freeze({
      mode: "active",
      reason: `Actionable feedback ${next.id} remains.`,
      nextAction: `Read and continue feedback ${next.id}.`,
      reference: { plugin: "contextual-feedback", id: next.id },
    });
  const review = orderedRecords(records).find((record) => record.status === "ready_for_review");
  if (review)
    return Object.freeze({
      mode: "waiting",
      reason: `Feedback ${review.id} is verified and waiting for user review.`,
      nextAction: `Resume if the user accepts or reopens feedback ${review.id}.`,
      reference: { plugin: "contextual-feedback", id: review.id },
    });
  const waiting = orderedRecords(records).find((record) => record.status === "waiting");
  if (waiting)
    return Object.freeze({
      mode: "waiting",
      reason: `Feedback ${waiting.id} is waiting for a recorded user answer.`,
      nextAction: `Resume when feedback ${waiting.id} receives the missing input.`,
      reference: { plugin: "contextual-feedback", id: waiting.id },
    });
  return Object.freeze({
    mode: "idle",
    reason: "Origin has no runnable feedback responsibility.",
    nextAction: null,
    reference: null,
  });
}

export function orderedRecords(records) {
  return [...records.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(freezeRecord);
}

function freezeRecord(record) {
  const clean = Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
  clean.messages = Object.freeze(
    (clean.messages || []).map((message) => Object.freeze({ ...message })),
  );
  clean.linkedWork = Object.freeze([...(clean.linkedWork || [])]);
  return Object.freeze(clean);
}
