#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { OwnerStore, bindArtifact } from "./store.mjs";

const root =
  process.env.ORIGIN_REPOSITORY_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), "origin-p31-p37-"));
const memory = new OwnerStore(root, "P31");
const lineage = new OwnerStore(root, "P37");
const caller = { class: "authorized-agent", proof_ref: "fixture:same-session" };
const job = "job:feature_01";
let revision = 0;

const mutate = (eventType, recordId, payload, inputRefs = []) => {
  const result = memory.mutate({
    operationId: `op_${recordId}`,
    expectedRevision: revision,
    eventType,
    aggregate: job,
    recordId,
    payload,
    inputRefs,
    privacy: "private",
    caller,
    occurredAt: "2026-09-28T12:00:00Z",
  });
  revision = result.owner_revision;
  return result.event;
};

const observeAttempt = mutate("attempt.opened", "observe_1", {
  phase: "Observe",
  profile_ref: "feature-implementation/v0",
  objective_revision: 1,
  runtime_revision: "origin:4649a199",
});
const fact = mutate("entry.appended", "fact_1", {
  attempt_id: "observe_1",
  kind: "fact",
  body: "The current artifact lacks the requested behavior.",
  evidence_refs: ["fixture:request"],
});
const handoff = mutate("handoff.published", "handoff_observe_plan_1", {
  source_attempt_id: "observe_1",
  target_phase: "Plan",
  selected_entry_refs: [fact],
  omissions: [],
});
const delivery = mutate("packet.delivered", "delivery_1", {
  handoff_ref: handoff,
  packet_ref: "P21:packet_1",
  target_phase_revision: 1,
});
const _planAttempt = mutate("attempt.opened", "plan_1", {
  phase: "Plan",
  profile_ref: "feature-implementation/v0",
  objective_revision: 1,
});
const decision = mutate("entry.appended", "decision_1", {
  attempt_id: "plan_1",
  kind: "decision",
  body: "Implement the smallest failing case first.",
  evidence_refs: [fact, handoff, delivery],
});
const use = mutate("packet.used", "use_1", {
  target_attempt_id: "plan_1",
  handoff_ref: handoff,
  packet_ref: "P21:packet_1",
  first_affected_ref: decision,
});
const _executeAttempt = mutate("attempt.opened", "execute_1", {
  phase: "Execute",
  profile_ref: "feature-implementation/v0",
  objective_revision: 1,
});
const action = mutate("entry.appended", "action_1", {
  attempt_id: "execute_1",
  kind: "action",
  body: "Changed the exact artifact revision.",
  artifact_revision: "fixture:artifact@2",
  evidence_refs: [decision, use],
});
const _verifyAttempt = mutate("attempt.opened", "verify_1", {
  phase: "Verify",
  profile_ref: "feature-implementation/v0",
  objective_revision: 1,
});
const result = mutate("entry.appended", "result_1", {
  attempt_id: "verify_1",
  kind: "result",
  body: "The requested behavior passes on artifact revision 2.",
  criterion_ref: "fixture:criterion_1",
  artifact_revision: "fixture:artifact@2",
  evidence_refs: [action],
});
const risk = mutate("entry.appended", "risk_1", {
  attempt_id: "verify_1",
  kind: "risk",
  body: "Automatic hooks remain outside this experiment.",
  evidence_refs: [result],
});

const lineageResult = bindArtifact(lineage, memory, {
  operationId: "op_lineage_1",
  expectedRevision: 0,
  eventType: "artifact.bound",
  aggregate: job,
  recordId: "lineage_1",
  payload: {
    artifact: {
      kind: "fixture",
      revision: "fixture:artifact@2",
      privacy: "private",
    },
    evidence_refs: {
      plan: [decision],
      execute: [action],
      verify: [result],
      limitations: [risk],
    },
    export_privacy: "private",
  },
  inputRefs: [decision, action, result, risk],
  privacy: "private",
  caller,
  occurredAt: "2026-09-28T12:00:00Z",
});

let staleRevisionRefusal;
try {
  memory.mutate({
    operationId: "op_stale",
    expectedRevision: 1,
    eventType: "entry.appended",
    aggregate: job,
    recordId: "stale_action",
    payload: {
      attempt_id: "execute_1",
      kind: "action",
      body: "Must not commit.",
    },
    caller,
  });
} catch (error) {
  staleRevisionRefusal = error.message;
}

const correction = mutate("entry.corrected", "correction_1", {
  prior_entry_ref: fact,
  reason: "Later evidence narrowed the original fact.",
  invalidates: [
    handoff.record_id,
    use.record_id,
    decision.record_id,
    action.record_id,
    result.record_id,
  ],
});
const repair = mutate("repair.opened", "repair_1", {
  source_attempt_id: "verify_1",
  target_phase: "Observe",
  reason_ref: correction,
});

process.stdout.write(
  `${JSON.stringify(
    {
      root,
      same_session: true,
      observe_attempt: observeAttempt,
      lineage: lineageResult.event,
      stale_revision_refusal: staleRevisionRefusal,
      correction,
      repair,
      memory_projection: memory.inspect(),
      lineage_projection: lineage.inspect(),
    },
    null,
    2,
  )}\n`,
);
