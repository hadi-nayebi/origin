export const KINDS = Object.freeze(["update", "feature", "bug"]);
export const STATUSES = Object.freeze([
  "open",
  "in_progress",
  "waiting",
  "ready_for_review",
  "resolved",
  "dismissed",
]);
export const MESSAGE_ROLES = Object.freeze(["user", "agent"]);
export const MESSAGE_TYPES = Object.freeze([
  "comment",
  "question",
  "answer",
  "interpretation",
  "progress",
  "verification",
  "review",
]);

export function normalizeCreateInput(input) {
  const kind = bounded(input?.kind, "Feedback kind", 1, 20);
  if (!KINDS.includes(kind)) throw new Error("Unknown feedback kind.");
  return Object.freeze({
    kind,
    body: bounded(input?.body, "Feedback body", 3, 2000),
    pagePath: safePath(input?.pagePath),
    pageLabel: singleLine(input?.pageLabel, "Page label", 1, 120),
  });
}

export function normalizeMessage(input, fallbackRole, now, id) {
  const role = input?.role || fallbackRole;
  const type = input?.type || (role === "user" ? "comment" : "progress");
  if (!MESSAGE_ROLES.includes(role)) throw new Error("Unknown feedback message role.");
  if (!MESSAGE_TYPES.includes(type)) throw new Error("Unknown feedback message type.");
  if (role === "user" && !["comment", "answer", "review"].includes(type))
    throw new Error("User feedback message type is invalid.");
  if (role === "agent" && ["comment", "answer", "review"].includes(type))
    throw new Error("Agent feedback message type is invalid.");
  return Object.freeze({
    id: normalizeMessageId(id),
    role,
    type,
    body: bounded(input?.body, "Message body", 1, 4000),
    at: now.toISOString(),
  });
}

export function validateCreatedRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("Feedback ledger contains an invalid record.");
  const expected = [
    "id",
    "kind",
    "body",
    "pagePath",
    "pageLabel",
    "status",
    "createdAt",
    "updatedAt",
    "messages",
    "classification",
    "interpretation",
    "linkedWork",
    "verification",
    "acceptance",
  ].sort();
  if (Object.keys(record).sort().join("|") !== expected.join("|"))
    throw new Error("Feedback ledger contains an invalid record shape.");
  normalizeId(record.id);
  normalizeCreateInput(record);
  if (record.status !== "open") throw new Error("New feedback must begin open.");
  if (!validTimestamp(record.createdAt) || record.updatedAt !== record.createdAt)
    throw new Error("Feedback ledger contains invalid timestamps.");
  if (!Array.isArray(record.messages) || record.messages.length !== 1)
    throw new Error("New feedback must contain its raw user message.");
  validateMessage(record.messages[0]);
  if (
    record.messages[0].role !== "user" ||
    record.messages[0].type !== "comment" ||
    record.messages[0].body !== record.body ||
    record.messages[0].at !== record.createdAt
  )
    throw new Error("Initial feedback message does not preserve raw input.");
  if (record.classification !== null || record.interpretation !== null)
    throw new Error("New feedback cannot contain an agent interpretation.");
  if (!Array.isArray(record.linkedWork) || record.linkedWork.length)
    throw new Error("New feedback linked work is invalid.");
  if (record.verification !== null || record.acceptance !== null)
    throw new Error("New feedback cannot already be verified or accepted.");
  return record;
}

export function validateEvent(event) {
  if (!event || event.schemaVersion !== 3 || typeof event.type !== "string")
    throw new Error("Feedback ledger contains an invalid event.");
  if (event.type === "feedback.created") return validateCreatedRecord(event.record);
  normalizeId(event.id);
  if (!validTimestamp(event.at)) throw new Error("Feedback event timestamp is invalid.");
  if (event.type === "feedback.message-added") return validateMessage(event.message);
  if (event.type === "feedback.interpreted") {
    bounded(event.classification, "Classification", 3, 80);
    bounded(event.interpretation, "Interpretation", 3, 2000);
    return event;
  }
  if (event.type === "feedback.work-linked") {
    bounded(event.workReference, "Work reference", 3, 240);
    return event;
  }
  if (event.type === "feedback.heartbeat") return event;
  if (event.type !== "feedback.status-changed")
    throw new Error("Feedback ledger contains an unknown event type.");
  if (!STATUSES.includes(event.status)) throw new Error("Feedback status is unknown.");
  if (event.status === "waiting") bounded(event.reason, "Waiting reason", 5, 1000);
  if (event.status === "ready_for_review")
    bounded(event.verification, "Verification evidence", 20, 4000);
  if (event.status === "resolved") bounded(event.acceptance, "Acceptance record", 3, 2000);
  if (event.status === "dismissed") bounded(event.reason, "Dismissal reason", 5, 1000);
  if (event.status === "open") bounded(event.reason, "Reopen or recovery reason", 3, 1000);
  return event;
}

export function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message))
    throw new Error("Feedback message is invalid.");
  if (
    Object.keys(message).sort().join("|") !== ["at", "body", "id", "role", "type"].sort().join("|")
  )
    throw new Error("Feedback message shape is invalid.");
  normalizeMessageId(message.id);
  if (!MESSAGE_ROLES.includes(message.role) || !MESSAGE_TYPES.includes(message.type))
    throw new Error("Feedback message role or type is invalid.");
  bounded(message.body, "Message body", 1, 4000);
  if (!validTimestamp(message.at)) throw new Error("Feedback message timestamp is invalid.");
  return message;
}

export function bounded(value, label, minimum, maximum) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const clean = value.trim();
  if (
    clean.length < minimum ||
    clean.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)
  )
    throw new Error(`${label} must be between ${minimum} and ${maximum} safe characters.`);
  return clean;
}
export function normalizeId(value) {
  const clean = bounded(value, "Feedback ID", 10, 128);
  if (value !== clean || !/^[A-Za-z0-9-]+$/.test(clean)) throw new Error("Feedback ID is invalid.");
  return clean;
}
export function normalizeMessageId(value) {
  const clean = bounded(value, "Message ID", 3, 128);
  if (value !== clean || !/^[A-Za-z0-9-]+$/.test(clean)) throw new Error("Message ID is invalid.");
  return clean;
}
function safePath(value) {
  const clean = bounded(value, "Page path", 1, 160);
  if (
    !clean.startsWith("/") ||
    clean.includes("..") ||
    clean.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(clean)
  )
    throw new Error("Invalid page path.");
  return clean;
}
function singleLine(value, label, minimum, maximum) {
  const clean = bounded(value, label, minimum, maximum);
  if (/[\r\n]/.test(clean)) throw new Error(`${label} must be a single safe line.`);
  return clean;
}
export function validTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
