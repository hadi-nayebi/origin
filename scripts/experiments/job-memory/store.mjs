import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EVENT_TYPES = {
  P31: new Set([
    "attempt.opened",
    "entry.appended",
    "entry.corrected",
    "handoff.published",
    "packet.delivered",
    "packet.used",
    "repair.opened",
    "attempt.closed",
  ]),
  P37: new Set(["artifact.bound"]),
};

const ALLOWED_INPUT = new Set([
  "operationId",
  "expectedRevision",
  "eventType",
  "aggregate",
  "recordId",
  "payload",
  "inputRefs",
  "privacy",
  "caller",
  "occurredAt",
  "failurePoint",
]);

export class OwnerStore {
  constructor(root, owner) {
    if (!EVENT_TYPES[owner]) throw new Error(`Unknown owner: ${owner}`);
    this.owner = owner;
    this.directory = path.join(root, ".origin", "experiments", owner.toLowerCase());
    this.journalPath = path.join(this.directory, "journal.jsonl");
    this.projectionPath = path.join(this.directory, "data.json");
    this.receiptsDirectory = path.join(this.directory, "receipts");
    this.lockPath = path.join(this.directory, "state.lock");
    fs.mkdirSync(this.receiptsDirectory, { recursive: true });
  }

  inspect() {
    if (!fs.existsSync(this.projectionPath)) return this.rebuild();
    return readJson(this.projectionPath);
  }

  rebuild() {
    const projection = emptyProjection(this.owner);
    if (!fs.existsSync(this.journalPath)) {
      atomicJson(this.projectionPath, projection);
      return projection;
    }
    const source = fs.readFileSync(this.journalPath, "utf8");
    const lines = source.split("\n");
    let offset = 0;
    for (const line of lines) {
      if (!line) {
        offset += 1;
        continue;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new Error(`Corrupt journal line at byte ${offset}`);
      }
      if (event.aggregate_revision !== projection.owner_revision + 1) {
        throw new Error(`Journal revision discontinuity at byte ${offset}`);
      }
      applyEvent(projection, event);
      offset += Buffer.byteLength(line) + 1;
    }
    atomicJson(this.projectionPath, projection);
    return projection;
  }

  resolve(ref) {
    validateRefShape(ref);
    if (ref.owner !== this.owner) throw new Error(`Reference owner ${ref.owner} is unavailable here`);
    const event = this.inspect().records[ref.record_id];
    if (!event) throw new Error(`Unresolved reference: ${ref.record_id}`);
    if (event.aggregate_revision !== ref.revision || event.payload_digest !== ref.digest) {
      throw new Error(`Reference changed: ${ref.record_id}`);
    }
    return event;
  }

  mutate(input) {
    for (const key of Object.keys(input)) {
      if (!ALLOWED_INPUT.has(key)) throw new Error(`Unknown input field: ${key}`);
    }
    requireString(input.operationId, "operationId");
    requireInteger(input.expectedRevision, "expectedRevision");
    requireString(input.aggregate, "aggregate");
    requireString(input.recordId, "recordId");
    if (!EVENT_TYPES[this.owner].has(input.eventType)) {
      throw new Error(`Unknown event type for ${this.owner}: ${input.eventType}`);
    }
    if (!input.caller?.class || !input.caller?.proof_ref) {
      throw new Error("Caller class and proof_ref are required");
    }
    const canonicalInput = stableJson({
      owner: this.owner,
      eventType: input.eventType,
      aggregate: input.aggregate,
      recordId: input.recordId,
      payload: input.payload,
      inputRefs: input.inputRefs || [],
      privacy: input.privacy || "private",
    });
    const inputDigest = digest(canonicalInput);
    const receiptPath = path.join(this.receiptsDirectory, `${safeId(input.operationId)}.json`);
    if (fs.existsSync(receiptPath)) {
      const receipt = readJson(receiptPath);
      if (receipt.input_digest !== inputDigest) throw new Error("Operation ID collision");
      return { ...receipt.result, replayed: true };
    }

    const lock = acquireLock(this.lockPath);
    try {
      const projection = this.inspect();
      if (projection.owner_revision !== input.expectedRevision) {
        throw new Error(
          `Stale owner revision: expected ${input.expectedRevision}, current ${projection.owner_revision}`,
        );
      }
      for (const ref of input.inputRefs || []) validateRefShape(ref);
      const payloadDigest = digest(stableJson(input.payload));
      const revision = projection.owner_revision + 1;
      const event = {
        schema: `${this.owner.toLowerCase()}-event/v1`,
        event_id: `evt_${digest(`${input.operationId}:${inputDigest}`).slice(7, 23)}`,
        operation_id: input.operationId,
        aggregate: input.aggregate,
        aggregate_revision: revision,
        event_type: input.eventType,
        record_id: input.recordId,
        occurred_at: input.occurredAt || new Date().toISOString(),
        caller: input.caller,
        input_refs: input.inputRefs || [],
        payload: input.payload,
        payload_digest: payloadDigest,
        privacy: input.privacy || "private",
      };
      const result = {
        event: eventRef(this.owner, event),
        owner_revision: revision,
      };
      if (input.failurePoint === "before-journal") throw new Error("Injected failure before journal");
      fs.mkdirSync(this.directory, { recursive: true });
      fs.appendFileSync(this.journalPath, `${JSON.stringify(event)}\n`);
      if (input.failurePoint === "after-journal") throw new Error("Injected failure after journal");
      applyEvent(projection, event);
      atomicJson(this.projectionPath, projection);
      if (input.failurePoint === "after-projection") {
        throw new Error("Injected failure after projection");
      }
      atomicJson(receiptPath, { input_digest: inputDigest, result });
      return { ...result, replayed: false };
    } finally {
      fs.closeSync(lock);
      fs.rmSync(this.lockPath, { force: true });
    }
  }
}

export function bindArtifact(lineageStore, memoryStore, input) {
  const refs = input.payload?.evidence_refs;
  if (!refs?.plan?.length || !refs?.execute?.length || !refs?.verify?.length) {
    throw new Error("Plan, Execute, and Verify evidence are required");
  }
  for (const group of Object.values(refs)) {
    for (const ref of group || []) {
      const event = memoryStore.resolve(ref);
      if (input.payload.export_privacy === "public" && event.privacy === "private") {
        if (!input.payload.derivation_receipt_ref) {
          throw new Error("Private evidence requires a derivation receipt for public export");
        }
      }
    }
  }
  return lineageStore.mutate(input);
}

export function eventRef(owner, event) {
  return {
    owner,
    aggregate: event.aggregate,
    record_type: event.event_type,
    record_id: event.record_id,
    revision: event.aggregate_revision,
    digest: event.payload_digest,
    schema: `${event.event_type}/v1`,
  };
}

function emptyProjection(owner) {
  return {
    schema: `${owner.toLowerCase()}-projection/v1`,
    owner_revision: 0,
    last_event_id: null,
    records: {},
    attempts: {},
    invalidated_refs: [],
    open_repairs: [],
  };
}

function applyEvent(projection, event) {
  projection.owner_revision = event.aggregate_revision;
  projection.last_event_id = event.event_id;
  projection.records[event.record_id] = event;
  const payload = event.payload || {};
  if (event.event_type === "attempt.opened") {
    projection.attempts[event.record_id] = {
      phase: payload.phase,
      status: "open",
      entry_refs: [],
      handoff_refs: [],
      consumed_handoff_refs: [],
    };
  } else if (event.event_type === "entry.appended") {
    projection.attempts[payload.attempt_id]?.entry_refs.push(event.record_id);
  } else if (event.event_type === "handoff.published") {
    projection.attempts[payload.source_attempt_id]?.handoff_refs.push(event.record_id);
  } else if (event.event_type === "packet.used") {
    projection.attempts[payload.target_attempt_id]?.consumed_handoff_refs.push(payload.handoff_ref);
  } else if (event.event_type === "entry.corrected") {
    projection.invalidated_refs.push(...(payload.invalidates || []));
  } else if (event.event_type === "repair.opened") {
    projection.open_repairs.push(event.record_id);
  } else if (event.event_type === "attempt.closed") {
    if (projection.attempts[payload.attempt_id]) {
      projection.attempts[payload.attempt_id].status = "closed";
    }
  }
}

function validateRefShape(ref) {
  for (const key of [
    "owner",
    "aggregate",
    "record_type",
    "record_id",
    "revision",
    "digest",
    "schema",
  ]) {
    if (ref?.[key] === undefined || ref[key] === null || ref[key] === "") {
      throw new Error(`Reference is missing ${key}`);
    }
  }
}

function acquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    return fs.openSync(lockPath, "wx");
  } catch {
    throw new Error("Owner is locked; retry after inspection");
  }
}

function atomicJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function safeId(value) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error("Operation ID is invalid");
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
}

function requireInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}
