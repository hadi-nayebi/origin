export const KINDS = Object.freeze(["update", "feature", "bug"]);
export const STATUSES = Object.freeze(["open", "in_progress", "waiting", "resolved", "dismissed"]);

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

export function validateCreatedRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("Feedback ledger contains an invalid record.");
  const keys = Object.keys(record).sort();
  const expected = [
    "body",
    "createdAt",
    "id",
    "kind",
    "pageLabel",
    "pagePath",
    "status",
    "updatedAt",
  ].sort();
  if (keys.join("|") !== expected.join("|"))
    throw new Error("Feedback ledger contains an invalid record shape.");
  normalizeId(record.id);
  normalizeCreateInput(record);
  if (record.status !== "open") throw new Error("New feedback must begin open.");
  if (!validTimestamp(record.createdAt) || record.updatedAt !== record.createdAt)
    throw new Error("Feedback ledger contains invalid timestamps.");
  return record;
}

export function validateTransitionEvent(event) {
  if (!event || ![1, 2].includes(event.schemaVersion) || event.type !== "feedback.status-changed")
    throw new Error("Feedback ledger contains an invalid transition event.");
  normalizeId(event.id);
  if (!STATUSES.includes(event.status))
    throw new Error("Feedback ledger contains an unknown status.");
  if (!validTimestamp(event.at))
    throw new Error("Feedback ledger contains an invalid transition timestamp.");
  if (event.status === "resolved") bounded(event.resolution, "Resolution evidence", 20, 2000);
  else if ("resolution" in event)
    throw new Error("Resolution evidence is valid only for resolved feedback.");
  if (event.status === "waiting") bounded(event.waitReason, "Waiting reason", 5, 1000);
  else if ("waitReason" in event)
    throw new Error("Waiting reason is valid only for waiting feedback.");
  if (event.status === "dismissed") bounded(event.dismissalReason, "Dismissal reason", 5, 1000);
  else if ("dismissalReason" in event)
    throw new Error("Dismissal reason is valid only for dismissed feedback.");
  if (event.status === "open" && "reopenReason" in event)
    bounded(event.reopenReason, "Reopen reason", 3, 1000);
  else if (event.status !== "open" && "reopenReason" in event)
    throw new Error("Reopen reason is valid only when reopening feedback.");
  if (event.status === "open" && "recoveryReason" in event)
    bounded(event.recoveryReason, "Recovery reason", 10, 1000);
  else if (event.status !== "open" && "recoveryReason" in event)
    throw new Error("Recovery reason is valid only when recovering feedback.");
  if (
    event.status === "open" &&
    Number("reopenReason" in event) + Number("recoveryReason" in event) !== 1
  )
    throw new Error("Open transitions require exactly one reopen or recovery reason.");
  const allowedKeys = new Set([
    "schemaVersion",
    "type",
    "id",
    "status",
    "at",
    "resolution",
    "waitReason",
    "dismissalReason",
    "reopenReason",
    "recoveryReason",
    "sequence",
    "previousHash",
    "hash",
  ]);
  if (Object.keys(event).some((key) => !allowedKeys.has(key)))
    throw new Error("Feedback transition contains unknown fields.");
  return event;
}

export function validateHeartbeatEvent(event) {
  if (!event || ![1, 2].includes(event.schemaVersion) || event.type !== "feedback.heartbeat")
    throw new Error("Feedback ledger contains an invalid heartbeat event.");
  normalizeId(event.id);
  if (!validTimestamp(event.at))
    throw new Error("Feedback ledger contains an invalid heartbeat timestamp.");
  const allowedKeys = new Set([
    "schemaVersion",
    "type",
    "id",
    "at",
    "sequence",
    "previousHash",
    "hash",
  ]);
  if (Object.keys(event).some((key) => !allowedKeys.has(key)))
    throw new Error("Feedback heartbeat contains unknown fields.");
  return event;
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
function safePath(value) {
  const clean = bounded(value, "Page path", 1, 240);
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
  if (/[\u0000-\u001f\u007f]/.test(clean)) throw new Error(`${label} must be a single safe line.`);
  return clean;
}
function validTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
