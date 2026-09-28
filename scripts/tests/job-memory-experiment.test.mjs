import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OwnerStore, bindArtifact } from "../experiments/job-memory/store.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const caller = { class: "authorized-agent", proof_ref: "fixture:test" };
const fixture = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "origin-job-memory-"));
const input = (revision, overrides = {}) => ({
  operationId: `op_${revision}_${Math.random().toString(16).slice(2)}`,
  expectedRevision: revision,
  eventType: "attempt.opened",
  aggregate: "job:1",
  recordId: `record_${revision}_${Math.random().toString(16).slice(2)}`,
  payload: { phase: "Observe" },
  caller,
  occurredAt: "2026-09-28T12:00:00Z",
  ...overrides,
});

test("P31/P37 same-session trace preserves causality and repair history", () => {
  const root = fixture();
  const script = path.join(
    repositoryRoot,
    "scripts/experiments/job-memory/run-trace.mjs",
  );
  const run = spawnSync(process.execPath, [script], {
    env: { ...process.env, ORIGIN_REPOSITORY_ROOT: root },
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.same_session, true);
  assert.match(result.stale_revision_refusal, /Stale owner revision/);
  assert.equal(result.memory_projection.owner_revision, 14);
  assert.equal(result.lineage_projection.owner_revision, 1);
  assert.equal(result.memory_projection.attempts.observe_1.status, "open");
  assert.deepEqual(result.memory_projection.open_repairs, ["repair_1"]);
  assert.ok(result.memory_projection.records.fact_1);
  assert.ok(result.memory_projection.records.correction_1);
  assert.ok(result.memory_projection.invalidated_refs.includes("action_1"));
});

test("fresh state rebuilds a zero-revision projection", () => {
  const store = new OwnerStore(fixture(), "P31");
  assert.equal(store.inspect().owner_revision, 0);
});

test("typed entry kinds remain distinct", () => {
  const store = new OwnerStore(fixture(), "P31");
  store.mutate(input(0));
  for (const [index, kind] of ["fact", "hypothesis", "constraint"].entries()) {
    store.mutate(
      input(index + 1, {
        eventType: "entry.appended",
        recordId: kind,
        payload: {
          attempt_id: Object.keys(store.inspect().attempts)[0],
          kind,
          body: kind,
        },
      }),
    );
  }
  assert.deepEqual(
    ["fact", "hypothesis", "constraint"].map(
      (id) => store.inspect().records[id].payload.kind,
    ),
    ["fact", "hypothesis", "constraint"],
  );
});

test("unknown fields and event types fail without mutation", () => {
  const store = new OwnerStore(fixture(), "P31");
  assert.throws(
    () => store.mutate({ ...input(0), surprise: true }),
    /Unknown input field/,
  );
  assert.throws(
    () => store.mutate(input(0, { eventType: "future.event" })),
    /Unknown event type/,
  );
  assert.equal(store.inspect().owner_revision, 0);
});

test("stale owner revisions fail closed", () => {
  const store = new OwnerStore(fixture(), "P31");
  store.mutate(input(0));
  assert.throws(() => store.mutate(input(0)), /Stale owner revision/);
  assert.equal(store.inspect().owner_revision, 1);
});

test("operation replay is idempotent and collision fails", () => {
  const store = new OwnerStore(fixture(), "P31");
  const operation = input(0, {
    operationId: "op_fixed",
    recordId: "attempt_1",
  });
  const first = store.mutate(operation);
  const replay = store.mutate(operation);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.event, first.event);
  assert.throws(
    () => store.mutate({ ...operation, payload: { phase: "Plan" } }),
    /Operation ID collision/,
  );
});

test("an existing owner lock produces an explicit retry boundary", () => {
  const root = fixture();
  const store = new OwnerStore(root, "P31");
  fs.writeFileSync(store.lockPath, "held");
  assert.throws(() => store.mutate(input(0)), /Owner is locked/);
});

test("journal-committed crash rebuilds one effect", () => {
  const root = fixture();
  const store = new OwnerStore(root, "P31");
  assert.throws(
    () =>
      store.mutate(
        input(0, { failurePoint: "after-journal", recordId: "attempt_1" }),
      ),
    /Injected failure/,
  );
  fs.rmSync(store.projectionPath, { force: true });
  assert.equal(store.rebuild().owner_revision, 1);
  assert.equal(
    fs.readFileSync(store.journalPath, "utf8").trim().split("\n").length,
    1,
  );
});

test("handoff publication is distinct from packet delivery and use", () => {
  const store = new OwnerStore(fixture(), "P31");
  const attempt = store.mutate(input(0, { recordId: "observe_1" })).event;
  const fact = store.mutate(
    input(1, {
      eventType: "entry.appended",
      recordId: "fact_1",
      payload: { attempt_id: "observe_1", kind: "fact", body: "fact" },
    }),
  ).event;
  const handoff = store.mutate(
    input(2, {
      eventType: "handoff.published",
      recordId: "handoff_1",
      payload: {
        source_attempt_id: "observe_1",
        target_phase: "Plan",
        selected_entry_refs: [fact],
      },
      inputRefs: [attempt, fact],
    }),
  ).event;
  store.mutate(
    input(3, {
      eventType: "packet.delivered",
      recordId: "delivery_1",
      payload: { handoff_ref: handoff, packet_ref: "P21:1" },
      inputRefs: [handoff],
    }),
  );
  store.mutate(input(4, { recordId: "plan_1", payload: { phase: "Plan" } }));
  store.mutate(
    input(5, {
      eventType: "packet.used",
      recordId: "use_1",
      payload: {
        target_attempt_id: "plan_1",
        handoff_ref: handoff,
        packet_ref: "P21:1",
        first_affected_ref: "decision:1",
      },
      inputRefs: [handoff],
    }),
  );
  const projection = store.inspect();
  assert.equal(projection.records.handoff_1.event_type, "handoff.published");
  assert.equal(projection.records.delivery_1.event_type, "packet.delivered");
  assert.equal(projection.records.use_1.event_type, "packet.used");
  assert.deepEqual(projection.attempts.plan_1.consumed_handoff_refs, [handoff]);
});

test("correction invalidates dependents without deleting history", () => {
  const store = new OwnerStore(fixture(), "P31");
  const fact = store.mutate(input(0, { recordId: "fact_1" })).event;
  store.mutate(
    input(1, {
      eventType: "entry.corrected",
      recordId: "correction_1",
      payload: {
        prior_entry_ref: fact,
        invalidates: ["decision_1", "action_1"],
      },
      inputRefs: [fact],
    }),
  );
  const projection = store.inspect();
  assert.ok(projection.records.fact_1);
  assert.ok(projection.records.correction_1);
  assert.deepEqual(projection.invalidated_refs, ["decision_1", "action_1"]);
});

test("backward repair preserves the source attempt", () => {
  const store = new OwnerStore(fixture(), "P31");
  store.mutate(
    input(0, { recordId: "verify_1", payload: { phase: "Verify" } }),
  );
  store.mutate(
    input(1, {
      eventType: "repair.opened",
      recordId: "repair_1",
      payload: {
        source_attempt_id: "verify_1",
        target_phase: "Observe",
        reason_ref: "evidence:1",
      },
    }),
  );
  assert.ok(store.inspect().attempts.verify_1);
  assert.deepEqual(store.inspect().open_repairs, ["repair_1"]);
});

test("artifact lineage requires Plan, Execute, and Verify evidence", () => {
  const root = fixture();
  const memory = new OwnerStore(root, "P31");
  const lineage = new OwnerStore(root, "P37");
  const refs = {};
  let revision = 0;
  for (const [name, phase] of [
    ["plan", "Plan"],
    ["execute", "Execute"],
    ["verify", "Verify"],
  ]) {
    refs[name] = memory.mutate(
      input(revision++, { recordId: name, payload: { phase } }),
    ).event;
  }
  const bind = (evidenceRefs, extra = {}) =>
    bindArtifact(lineage, memory, {
      operationId: "op_lineage",
      expectedRevision: 0,
      eventType: "artifact.bound",
      aggregate: "job:1",
      recordId: "lineage_1",
      payload: {
        evidence_refs: evidenceRefs,
        export_privacy: "private",
        ...extra,
      },
      inputRefs: Object.values(evidenceRefs).flat(),
      privacy: "private",
      caller,
    });
  assert.throws(
    () => bind({ plan: [refs.plan], execute: [refs.execute] }),
    /Verify evidence/,
  );
  assert.equal(
    bind({ plan: [refs.plan], execute: [refs.execute], verify: [refs.verify] })
      .owner_revision,
    1,
  );
});

test("public lineage refuses private evidence without derivation receipt", () => {
  const root = fixture();
  const memory = new OwnerStore(root, "P31");
  const lineage = new OwnerStore(root, "P37");
  const refs = ["plan", "execute", "verify"].map(
    (recordId, index) =>
      memory.mutate(input(index, { recordId, payload: { phase: recordId } }))
        .event,
  );
  assert.throws(
    () =>
      bindArtifact(lineage, memory, {
        operationId: "op_lineage_public",
        expectedRevision: 0,
        eventType: "artifact.bound",
        aggregate: "job:1",
        recordId: "lineage_public",
        payload: {
          evidence_refs: {
            plan: [refs[0]],
            execute: [refs[1]],
            verify: [refs[2]],
          },
          export_privacy: "public",
        },
        inputRefs: refs,
        caller,
      }),
    /derivation receipt/,
  );
});

test("projection deletion and dashboard or channel removal do not erase owner state", () => {
  const root = fixture();
  const store = new OwnerStore(root, "P31");
  store.mutate(input(0, { recordId: "attempt_1" }));
  const before = store.inspect();
  fs.mkdirSync(path.join(root, ".origin", "contextual-feedback"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, ".origin", "dashboard"), { recursive: true });
  fs.rmSync(path.join(root, ".origin", "contextual-feedback"), {
    recursive: true,
  });
  fs.rmSync(path.join(root, ".origin", "dashboard"), { recursive: true });
  fs.rmSync(store.projectionPath);
  assert.deepEqual(store.rebuild(), before);
});

test("corrupt trailing journal line reports its exact boundary", () => {
  const root = fixture();
  const store = new OwnerStore(root, "P31");
  store.mutate(input(0, { recordId: "attempt_1" }));
  fs.appendFileSync(store.journalPath, "not-json\n");
  fs.rmSync(store.projectionPath);
  assert.throws(() => store.rebuild(), /Corrupt journal line at byte/);
});
