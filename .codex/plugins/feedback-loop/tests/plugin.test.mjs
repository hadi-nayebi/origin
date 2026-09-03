import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { buildAgentInvocation, feedbackRunnerStatus, runFeedbackLoop } from "../lib/delivery.mjs";
import { sealEvent } from "../lib/integrity.mjs";
import {
  createFeedback,
  feedbackBackups,
  heartbeatFeedback,
  listFeedback,
  migrateFeedback,
  nextFeedback,
  recoverStaleFeedback,
  restoreFeedback,
  stopOutcome,
  transitionFeedback,
  verifyFeedback,
} from "../lib/service.mjs";
import { renderVoice } from "../lib/voice.mjs";

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "origin-feedback-"));
}

test("new feedback is durable, page-aware, and keeps the agent active", () => {
  const root = fixture();
  const record = createFeedback(
    root,
    { kind: "feature", body: "Create a project page", pagePath: "/", pageLabel: "Origin canvas" },
    new Date("2026-09-02T12:00:00Z"),
  );
  assert.equal(listFeedback(root)[0].pagePath, "/");
  assert.equal(nextFeedback(root).id, record.id);
  assert.deepEqual(stopOutcome(root), {
    mode: "active",
    block: true,
    reference: record.id,
    voiceId: "stop.active",
  });
});

test("in-progress feedback stays focused before older open feedback", () => {
  const root = fixture();
  const first = createFeedback(
    root,
    { kind: "update", body: "First open request", pagePath: "/", pageLabel: "Canvas" },
    new Date("2026-09-02T12:00:00Z"),
  );
  const second = createFeedback(
    root,
    { kind: "bug", body: "Second open request", pagePath: "/wiki", pageLabel: "Wiki" },
    new Date("2026-09-02T12:01:00Z"),
  );
  transitionFeedback(root, second.id, "in_progress", {}, new Date("2026-09-02T12:02:00Z"));
  assert.equal(nextFeedback(root).id, second.id);
  assert.equal(listFeedback(root).find((item) => item.id === first.id).status, "open");
});

test("only one feedback record may be in progress", () => {
  const root = fixture();
  const first = createFeedback(root, {
    kind: "update",
    body: "First request",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  const second = createFeedback(root, {
    kind: "update",
    body: "Second request",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  transitionFeedback(root, first.id, "in_progress");
  assert.throws(
    () => transitionFeedback(root, second.id, "in_progress"),
    /Only one feedback record/,
  );
});

test("waiting permits Stop only when no other actionable record remains", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "update",
    body: "Choose the desired name",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  transitionFeedback(root, record.id, "waiting", {
    waitReason: "The user must choose between two consequential names.",
  });
  assert.equal(stopOutcome(root).mode, "waiting");
  assert.equal(stopOutcome(root).block, false);
});

test("resolution requires evidence and produces idle only after all work closes", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "bug",
    body: "Fix the broken control",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  transitionFeedback(root, record.id, "in_progress");
  assert.throws(
    () => transitionFeedback(root, record.id, "resolved", { resolution: "fixed" }),
    /Resolution evidence/,
  );
  transitionFeedback(root, record.id, "resolved", {
    resolution: "Repaired the control and verified it through the browser test.",
  });
  assert.equal(stopOutcome(root).mode, "idle");
});

test("dismissal requires a reason and reopening clears terminal metadata", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Add an optional panel",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  assert.throws(() => transitionFeedback(root, record.id, "dismissed"), /Dismissal reason/);
  transitionFeedback(root, record.id, "dismissed", {
    reason: "The user explicitly withdrew this request.",
  });
  const reopened = transitionFeedback(root, record.id, "open", {
    reason: "The user requested it again.",
  });
  assert.equal(reopened.dismissalReason, undefined);
  assert.equal(reopened.reopenReason, "The user requested it again.");
});

test("corrupt ledger fails closed", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  fs.writeFileSync(path.join(root, ".origin", "feedback.jsonl"), "not-json\n");
  assert.throws(() => stopOutcome(root), /corrupt/);
});

test("illegal transitions in persisted history fail closed", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "bug",
    body: "Repair the page control",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  const file = path.join(root, ".origin", "feedback.jsonl");
  appendSealed(file, {
    type: "feedback.status-changed",
    id: record.id,
    status: "resolved",
    at: new Date().toISOString(),
    resolution: "Claims resolution without entering focused work.",
  });
  assert.throws(() => listFeedback(root), /Invalid feedback transition/);
});

test("chronologically invalid persisted history fails closed", () => {
  const root = fixture();
  const record = createFeedback(
    root,
    { kind: "bug", body: "Repair the page control", pagePath: "/", pageLabel: "Canvas" },
    new Date("2026-09-02T12:00:00Z"),
  );
  const file = path.join(root, ".origin", "feedback.jsonl");
  appendSealed(file, {
    type: "feedback.status-changed",
    id: record.id,
    status: "in_progress",
    at: "2026-09-02T11:59:59.000Z",
  });
  assert.throws(() => listFeedback(root), /timestamp moves backward/);
});

test("hash-chain tampering fails closed", () => {
  const root = fixture();
  createFeedback(root, {
    kind: "bug",
    body: "Preserve this exact request",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  const file = path.join(root, ".origin", "feedback.jsonl");
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace("Preserve this exact request", "Silently changed request"),
  );
  assert.throws(() => verifyFeedback(root), /integrity check failed/);
});

test("v1 ledgers migrate to chained v2 with a recoverable backup", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  const at = "2026-09-02T12:00:00.000Z";
  const record = {
    id: "legacy-record-0001",
    kind: "update",
    body: "Migrate this legacy request",
    pagePath: "/",
    pageLabel: "Canvas",
    status: "open",
    createdAt: at,
    updatedAt: at,
  };
  fs.writeFileSync(
    path.join(root, ".origin", "feedback.jsonl"),
    `${JSON.stringify({ schemaVersion: 1, type: "feedback.created", record })}\n`,
  );
  assert.equal(verifyFeedback(root).migrationRequired, true);
  assert.equal(migrateFeedback(root).migrationRequired, false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, ".origin", "feedback.jsonl"), "utf8")).schemaVersion,
    2,
  );
  assert.equal(feedbackBackups(root).length, 1);
});

test("legacy lifecycle details are normalized during migration", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  const createdAt = "2026-09-02T12:00:00.000Z";
  const id = "legacy-record-0002";
  const events = [
    {
      schemaVersion: 1,
      type: "feedback.created",
      record: {
        id,
        kind: "update",
        body: "Preserve a complete legacy lifecycle",
        pagePath: "/",
        pageLabel: "Canvas",
        status: "open",
        createdAt,
        updatedAt: createdAt,
      },
    },
    {
      schemaVersion: 1,
      type: "feedback.status-changed",
      id,
      status: "dismissed",
      at: "2026-09-02T12:01:00.000Z",
    },
    {
      schemaVersion: 1,
      type: "feedback.status-changed",
      id,
      status: "open",
      at: "2026-09-02T12:02:00.000Z",
    },
  ];
  fs.writeFileSync(
    path.join(root, ".origin", "feedback.jsonl"),
    `${events.map(JSON.stringify).join("\n")}\n`,
  );
  const record = listFeedback(root)[0];
  assert.equal(record.status, "open");
  assert.equal(record.reopenReason, "Migrated legacy reopen event.");
  migrateFeedback(root);
  assert.equal(verifyFeedback(root).migrationRequired, false);
});

test("published ledger events and lifecycle details match the public JSON Schema", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "bug",
    body: "Validate every persisted event",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  transitionFeedback(root, record.id, "in_progress");
  heartbeatFeedback(root, record.id);
  transitionFeedback(root, record.id, "resolved", {
    resolution: "Validated generated events against the tracked JSON Schema.",
  });
  const schema = JSON.parse(
    fs.readFileSync(
      path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data.schema.json"),
      "utf8",
    ),
  );
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const events = fs
    .readFileSync(path.join(root, ".origin", "feedback.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  for (const event of events) assert.equal(validate(event), true, JSON.stringify(validate.errors));
  assert.equal(
    validate({ ...events.at(-1), waitReason: "This field belongs to waiting only." }),
    false,
  );
});

test("automatic backups restore a previously valid ledger", () => {
  const root = fixture();
  createFeedback(root, {
    kind: "update",
    body: "First durable request",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  createFeedback(root, {
    kind: "update",
    body: "Second durable request",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  const backup = feedbackBackups(root)[0];
  restoreFeedback(root, backup);
  assert.deepEqual(
    listFeedback(root).map((record) => record.body),
    ["First durable request"],
  );
});

test("heartbeats preserve live focus and stale focus recovers", () => {
  const root = fixture();
  const record = createFeedback(
    root,
    { kind: "feature", body: "Perform a longer change", pagePath: "/", pageLabel: "Canvas" },
    new Date("2026-09-02T10:00:00Z"),
  );
  transitionFeedback(root, record.id, "in_progress", {}, new Date("2026-09-02T10:01:00Z"));
  heartbeatFeedback(root, record.id, new Date("2026-09-02T11:00:00Z"));
  assert.equal(
    recoverStaleFeedback(root, { maximumAgeMs: 7_200_000 }, new Date("2026-09-02T12:00:00Z")),
    null,
  );
  const recovered = recoverStaleFeedback(
    root,
    { maximumAgeMs: 7_200_000 },
    new Date("2026-09-02T13:01:00Z"),
  );
  assert.equal(recovered.status, "open");
  assert.match(recovered.recoveryReason, /Recovered/);
});

test("agent delivery exposes only a stable reference and drains the queue", async () => {
  const root = fixture();
  const first = createFeedback(root, {
    kind: "update",
    body: "Private feedback body one",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  createFeedback(root, {
    kind: "bug",
    body: "Private feedback body two",
    pagePath: "/wiki",
    pageLabel: "Wiki",
  });
  const invocation = buildAgentInvocation(first.id, {});
  assert.equal(invocation.command, "codex");
  assert.deepEqual(invocation.args.slice(0, 3), ["exec", "--sandbox", "workspace-write"]);
  assert.doesNotMatch(invocation.args.join(" "), /Private feedback body/);
  const result = await runFeedbackLoop(root, {
    maximumCycles: 3,
    wait: async () => {},
    invokeAgent: async (workingRoot, reference) => {
      transitionFeedback(workingRoot, reference, "in_progress");
      transitionFeedback(workingRoot, reference, "resolved", {
        resolution: "Completed the requested change and verified the resulting behavior.",
      });
      return { code: 0 };
    },
  });
  assert.equal(result.state, "idle");
  assert.equal(result.cycles, 2);
});

test("agent delivery configuration is strictly bounded", () => {
  const reference = "bounded-record-0001";
  assert.throws(
    () => buildAgentInvocation(reference, { ORIGIN_AGENT_COMMAND: "x".repeat(501) }),
    /Invalid agent command/,
  );
  assert.throws(
    () =>
      buildAgentInvocation(reference, {
        ORIGIN_AGENT_ARGS_JSON: JSON.stringify(Array(51).fill("argument")),
      }),
    /bounded JSON array/,
  );
  assert.throws(
    () => buildAgentInvocation(reference, { ORIGIN_AGENT_ARGS_JSON: "not-json" }),
    /Unexpected token|JSON/,
  );
  assert.throws(
    () => buildAgentInvocation(reference, { ORIGIN_AGENT_ARGS_JSON: JSON.stringify(["bad\narg"]) }),
    /bounded JSON array/,
  );
});

test("failed agent delivery remains actionable and exposes only bounded status", async () => {
  const root = fixture();
  createFeedback(root, {
    kind: "bug",
    body: "Remain open after an unavailable delivery",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  const result = await runFeedbackLoop(root, {
    maximumCycles: 1,
    invokeAgent: async () => ({ code: 7, signal: null }),
  });
  assert.deepEqual(result, { state: "active", cycles: 1 });
  const status = feedbackRunnerStatus(root);
  assert.equal(status.state, "unavailable");
  assert.equal("error" in status.last, false);
  assert.equal(stopOutcome(root).block, true);
});

test("a corrupt delivery journal reports unavailable instead of silently appearing idle", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  fs.writeFileSync(path.join(root, ".origin", "delivery.jsonl"), "not-json\n");
  assert.equal(feedbackRunnerStatus(root).state, "unavailable");
});

test("an interrupted delivery reports unavailable after its runner lease disappears", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  fs.writeFileSync(
    path.join(root, ".origin", "delivery.jsonl"),
    `${JSON.stringify({
      schemaVersion: 1,
      type: "delivery.started",
      reference: "interrupted-record-0001",
      at: new Date().toISOString(),
    })}\n`,
  );
  assert.equal(feedbackRunnerStatus(root).state, "unavailable");
});

test("IDs and page metadata share the delivery boundary's safe grammar", () => {
  const root = fixture();
  assert.throws(
    () =>
      createFeedback(root, {
        kind: "bug",
        body: "Reject multiline page metadata",
        pagePath: "/safe\nunsafe",
        pageLabel: "Canvas",
      }),
    /Invalid page path/,
  );
  const record = createFeedback(root, {
    kind: "bug",
    body: "Reject malformed record identifiers",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  assert.throws(() => transitionFeedback(root, `${record.id}\n`, "in_progress"), /Feedback ID/);
});

test("an expired ledger lock is recoverable even after PID reuse", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"));
  fs.writeFileSync(
    path.join(root, ".origin", "feedback.lock"),
    JSON.stringify({
      pid: process.pid,
      host: os.hostname(),
      token: "stale-token",
      createdAt: "2000-01-01T00:00:00.000Z",
    }),
  );
  createFeedback(root, {
    kind: "update",
    body: "Recover the abandoned writer lease",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  assert.equal(listFeedback(root).length, 1);
});

test("delivery invokes a real shell-free child process and records its log", async () => {
  const root = fixture();
  createFeedback(root, {
    kind: "bug",
    body: "Exercise the subprocess adapter",
    pagePath: "/",
    pageLabel: "Canvas",
  });
  const fakeAgent = path.resolve(path.dirname(new URL(import.meta.url).pathname), "fake-agent.mjs");
  const result = await runFeedbackLoop(root, {
    maximumCycles: 1,
    environment: {
      ...process.env,
      ORIGIN_AGENT_COMMAND: process.execPath,
      ORIGIN_AGENT_ARGS_JSON: JSON.stringify([fakeAgent]),
    },
  });
  assert.equal(result.state, "idle");
  assert.equal(listFeedback(root)[0].status, "resolved");
  assert.equal(fs.existsSync(path.join(root, ".origin", "agent.log")), true);
});

test("concurrent writers preserve every record and a valid chain", async () => {
  const root = fixture();
  const worker = path.resolve(path.dirname(new URL(import.meta.url).pathname), "worker.mjs");
  const statuses = await Promise.all(
   