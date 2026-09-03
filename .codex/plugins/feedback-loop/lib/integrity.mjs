import crypto from "node:crypto";

export const CURRENT_SCHEMA_VERSION = 2;
export const GENESIS_HASH = "GENESIS";

export function sealEvent(event, sequence, previousHash) {
  const unsigned = { ...event, schemaVersion: CURRENT_SCHEMA_VERSION, sequence, previousHash };
  delete unsigned.hash;
  return Object.freeze({ ...unsigned, hash: digest(unsigned) });
}

export function verifyEnvelope(event, expectedSequence, expectedPreviousHash) {
  if (event.schemaVersion !== CURRENT_SCHEMA_VERSION)
    throw new Error("Feedback ledger contains an unsupported event version.");
  if (event.sequence !== expectedSequence)
    throw new Error("Feedback ledger sequence is discontinuous.");
  if (event.previousHash !== expectedPreviousHash)
    throw new Error("Feedback ledger hash chain is discontinuous.");
  if (!/^[a-f0-9]{64}$/.test(event.hash || ""))
    throw new Error("Feedback ledger event hash is invalid.");
  const unsigned = { ...event };
  delete unsigned.hash;
  if (digest(unsigned) !== event.hash) throw new Error("Feedback ledger integrity check failed.");
  return event.hash;
}

export function upgradeEvents(events) {
  let previousHash = GENESIS_HASH;
  return events.map((event, index) => {
    const payload = { ...event };
    delete payload.sequence;
    delete payload.previousHash;
    delete payload.hash;
    if (
      payload.type === "feedback.status-changed" &&
      payload.status === "dismissed" &&
      !payload.dismissalReason
    )
      payload.dismissalReason = "Migrated legacy dismissal without a recorded reason.";
    if (
      payload.type === "feedback.status-changed" &&
      payload.status === "open" &&
      !payload.reopenReason &&
      !payload.recoveryReason
    )
      payload.reopenReason = "Migrated legacy reopen event.";
    const sealed = sealEvent(payload, index + 1, previousHash);
    previousHash = sealed.hash;
    return sealed;
  });
}

function digest(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
